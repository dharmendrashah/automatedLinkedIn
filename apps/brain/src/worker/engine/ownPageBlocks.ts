import { type PersonItem, mergeBySlug, person } from 'core'

import { OwnPagesService, WorkflowRunService } from 'database'

import {
   type Context,
   type StepResult,
   aside,
   configOf,
   elseKey,
   keepItems,
   peopleOf,
   textIn,
   wordsIn,
} from './context'
import { storedAccountsOf } from './personBlocks'

// "Get notifications", "Get profile viewers", "Get my feed posts" and "Get mutual connections" (.plan/lead-pipeline-p9-new-reads.md). They give back
// what the reads of the accounts' own pages stored; none opens LinkedIn or costs anything, and none acts.

const DAY_MS = 24 * 60 * 60 * 1000

const DAYS: Record<string, number> = {
   '24h': 1,
   '3d': 3,
   '7d': 7,
   '14d': 14,
   '30d': 30,
}

const NOTIFICATION_KINDS: Record<string, string[]> = {
   viewed: ['viewed'],
   engaged: ['reacted', 'commented'],
   accepted: ['accepted'],
   life: ['jobchange', 'anniversary', 'birthday'],
   mentions: ['mentioned'],
}

const FEED_KINDS: Record<string, string[]> = {
   posts: ['post'],
   life: ['lifeEvent'],
   both: ['post', 'lifeEvent'],
}

const sinceOf = (config: Record<string, unknown>, now: Date) =>
   new Date(now.getTime() - (DAYS[textIn(config, 'since')] ?? 7) * DAY_MS)

const linked = (slug: string, facts: PersonItem['facts']): PersonItem =>
   person({
      slug,
      url: `https://www.linkedin.com/in/${slug}`,
      facts,
   })

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

export const getNotifications = async (ctx: Context, now = new Date()): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const accountIds = await storedAccountsOf(ctx)
   const kinds = wordsIn(config, 'kinds').flatMap(pick => NOTIFICATION_KINDS[pick] ?? [])
   const found =
      accountIds.length === 0 || kinds.length === 0
         ? {
              rows: 0,
              people: new Map<string, { kinds: string[]; count: number }>(),
           }
         : await OwnPagesService.notifications(ctx.run.userId, accountIds, sinceOf(config, now), kinds)
   const people = [...found.people].map(([slug, { kinds: seen, count }]) =>
      linked(slug, {
         'notification.kinds': seen.join(', '),
         'notification.count': count,
      })
   )
   const result = await keepItems(ctx, people, 0)

   return {
      ...result,
      message: `${plural(accountIds.length, 'account')}, ${plural(found.rows, 'notification')}, ${plural(people.length, 'person', 'people')}.`,
   }
}

export const getViewers = async (ctx: Context, now = new Date()): Promise<StepResult> => {
   const accountIds = await storedAccountsOf(ctx)
   const found =
      accountIds.length === 0
         ? {
              people: [],
              groups: 0,
           }
         : await OwnPagesService.viewers(ctx.run.userId, accountIds, sinceOf(configOf(ctx.node), now))
   const result = await keepItems(
      ctx,
      found.people.map(slug => linked(slug, undefined)),
      0
   )

   return {
      ...result,
      message: `${plural(accountIds.length, 'account')}, ${plural(found.people.length, 'person', 'people')}.${
         found.people.length === 0 && found.groups > 0
            ? ` ${found.groups} viewers were only counted in groups, which name no one (a free account sees no names).`
            : ''
      }`,
   }
}

export const getFeed = async (ctx: Context, now = new Date()): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const accountIds = await storedAccountsOf(ctx)
   const found =
      accountIds.length === 0
         ? {
              posts: 0,
              authors: new Map<string, string>(),
           }
         : await OwnPagesService.feed(
              ctx.run.userId,
              accountIds,
              sinceOf(config, now),
              FEED_KINDS[textIn(config, 'show')] ?? FEED_KINDS.both
           )
   const result = await keepItems(
      ctx,
      [...found.authors].map(([slug, kind]) => linked(slug, { 'feed.kind': kind })),
      0
   )

   return {
      ...result,
      message:
         found.posts === 0
            ? 'No posts seen.'
            : `${plural(accountIds.length, 'account')}, ${plural(found.posts, 'post')} seen, ${plural(found.authors.size, 'author')}.`,
   }
}

export const getMutual = async (ctx: Context): Promise<StepResult> => {
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const accountIds = await storedAccountsOf(ctx)
   const reads =
      accountIds.length === 0
         ? new Map<string, { count: number; mutual: string[] }>()
         : await OwnPagesService.mutual(
              ctx.run.userId,
              accountIds,
              people.map(({ slug }) => slug)
           )
   const read = people.filter(({ slug }) => reads.has(slug))
   const unread = people.filter(({ slug }) => !reads.has(slug))

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), aside(unread, 'mutual', 'Not read yet.'))

   const result = await keepItems(
      ctx,
      read.map(item => {
         const found = reads.get(item.slug)

         return {
            ...item,
            facts: {
               ...item.facts,
               'mutual.count': found?.count ?? 0,
               'mutual.first': found?.mutual[0] ?? null,
            },
         }
      }),
      people.length
   )

   return {
      ...result,
      message: `${people.length} in, ${read.length} with a stored read, ${unread.length} to Else.`,
   }
}
