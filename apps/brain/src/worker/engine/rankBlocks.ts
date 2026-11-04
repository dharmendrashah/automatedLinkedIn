import { type PersonItem, type WorkflowItemData, mergeBySlug } from 'core'
import { type RankSignal, pickBestPer, rankCompany, rankPerson, spaceOutReason } from 'core/ranking'

import {
   type Colleague,
   ColleaguesService,
   PeopleService,
   PersonDatesService,
   SignalService,
   WorkflowListService,
   WorkflowRunService,
} from 'database'

import { FADE_SPEEDS, type SignalType, type TierLines, modelOf } from '@automatedLinkedIn/contracts'

import {
   type Context,
   type StepResult,
   aside,
   companiesOf,
   configOf,
   elseKey,
   keepItems,
   numberIn,
   peopleOf,
   rulesOf,
   wordsIn,
} from './context'

// The ranking and routing blocks (.plan/lead-pipeline-p7-ranking.md). Each keeps what it does not pass on for an Else after it, with one
// fixed sentence of why, so nothing is lost.

const MODELS = ['balanced', 'fitFirst', 'intentFirst'] as const

const linesIn = (config: Record<string, unknown>): TierLines => ({
   a: numberIn(config, 'tierA'),
   b: numberIn(config, 'tierB'),
   c: numberIn(config, 'tierC'),
})

const modelIn = (config: Record<string, unknown>) => modelOf(MODELS.find(id => id === config.model) ?? 'balanced')

const speedIn = (config: Record<string, unknown>) =>
   config.fade === 'slow' ? FADE_SPEEDS.slow : config.fade === 'fast' ? FADE_SPEEDS.fast : FADE_SPEEDS.normal

const atOf = (at: string | null, now: Date) => {
   const time = at ? Date.parse(at) : Number.NaN

   return Number.isNaN(time) ? now : new Date(time)
}

const signalTypeOf = (type: PersonItem['signals'][number]['type']): SignalType =>
   type === 'hiring' ? 'hiringCompany' : type

const tally = (items: Array<{ tier?: string | null }>) =>
   ['A', 'B', 'C', 'D'].map(tier => `${items.filter(item => item.tier === tier).length} ${tier}`)

export const scoreSignals = async (ctx: Context): Promise<StepResult> => {
   const { userId } = ctx.run
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const config = configOf(ctx.node)
   const rules = await rulesOf(userId, ctx.node)
   const now = new Date()
   const slugs = people.map(({ slug }) => slug)
   const found = people.flatMap(item =>
      item.signals.map(signal => ({
         slug: item.slug,
         type: signalTypeOf(signal.type),
         via: signal.via,
         at: atOf(signal.at, now),
         excerpt: signal.excerpt,
      }))
   )

   // A preview writes nothing; the signals it found still count for the people in it.
   if (!ctx.preview) {
      await SignalService.recordPeople(userId, found)
   }

   const [stored, dates, stopped] = await Promise.all([
      SignalService.forPeople(userId, slugs, now),
      PersonDatesService.forSlugs(userId, slugs),
      WorkflowListService.seenAmong(userId, slugs, {
         lists: false,
         profiles: false,
      }),
   ])
   const model = modelIn(config)
   const lines = linesIn(config)
   const options = {
      speed: speedIn(config),
      now,
      never: {
         titles: wordsIn(config, 'neverTitles'),
         companies: wordsIn(config, 'neverCompanies'),
      },
   }
   const signalsOf = ({ slug }: PersonItem): RankSignal[] => {
      const date = dates.get(slug)

      return [
         ...(stored.get(slug) ?? []),
         ...found.filter(row => row.slug === slug),
         ...(date?.accepted
            ? [
                 {
                    type: 'accepted' as const,
                    at: date.accepted,
                 },
              ]
            : []),
         ...(date?.wroteBack
            ? [
                 {
                    type: 'replied' as const,
                    at: date.wroteBack,
                 },
              ]
            : []),
      ]
   }
   const scored: PersonItem[] = []
   const out = new Map<string, PersonItem[]>()
   const leave = (reason: string, item: PersonItem) => out.set(reason, [...(out.get(reason) ?? []), item])

   for (const item of people) {
      if (stopped.has(item.slug)) {
         leave('Excluded: do not contact.', item)

         continue
      }

      const ranked = rankPerson(
         {
            headline: item.headline,
            title: item.title,
            location: item.location,
            company: item.company,
            companyIndustry: item.companyIndustry ?? null,
            companySize: item.companySize ?? null,
            followers: item.followers,
            read: item.enriched,
            signals: signalsOf(item),
         },
         rules,
         model,
         lines,
         options
      )

      if (ranked.excluded) {
         leave(ranked.excluded, item)
      } else if (ranked.tier === 'D' && config.keepTierD === false) {
         leave('Tier D.', item)
      } else {
         scored.push({
            ...item,
            score: ranked.score,
            tier: ranked.tier,
            matched: ranked.matched,
         })
      }
   }

   const rest = [...out].flatMap(([reason, items]) => aside(items, 'score', reason))

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), rest)

   const result = await keepItems(ctx, scored, people.length)

   return {
      ...result,
      message: `${people.length} in, ${tally(scored).join(', ')}, ${rest.length} to Else.`,
   }
}

export const scoreCompanies = async (ctx: Context): Promise<StepResult> => {
   const { userId } = ctx.run
   const companies = companiesOf(ctx.inputs)
   const config = configOf(ctx.node)
   const rules = await rulesOf(userId, ctx.node)
   const now = new Date()
   const hiring = companies.filter(({ hiring: roles }) => roles.length > 0)

   if (!ctx.preview) {
      await SignalService.recordCompanies(
         userId,
         hiring.map(({ slug, url }) => ({
            slug,
            type: 'hiring',
            via: url,
            at: now,
         }))
      )
   }

   const stored = await SignalService.forCompanies(
      userId,
      companies.map(({ slug }) => slug),
      now
   )
   const model = modelIn(config)
   const lines = linesIn(config)
   const options = {
      speed: speedIn(config),
      now,
      never: {
         titles: [],
         companies: wordsIn(config, 'neverCompanies'),
      },
   }
   const scored: WorkflowItemData[] = []
   const left: WorkflowItemData[] = []
   let unread = 0

   for (const item of companies) {
      const { preview } = item
      const ranked = rankCompany(
         {
            name: item.name ?? preview?.name ?? null,
            industry: preview?.industry ?? null,
            size: preview?.employeeRange ?? null,
            location: preview?.headquarters ?? null,
            specialities: preview?.specialities ?? [],
            tagline: preview?.tagline ?? null,
            signals: [
               ...(stored.get(item.slug) ?? []),
               ...(item.hiring.length > 0
                  ? [
                       {
                          type: 'hiring' as const,
                          at: now,
                       },
                    ]
                  : []),
            ],
         },
         rules,
         model,
         lines,
         options
      )

      unread += ranked.unread ? 1 : 0

      if (ranked.excluded) {
         left.push(item)
      } else {
         scored.push({
            ...item,
            score: ranked.score,
            tier: ranked.tier,
            matched: ranked.matched,
         })
      }
   }

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), aside(left, 'score', 'Excluded: company.'))

   const result = await keepItems(ctx, scored, companies.length)

   return {
      ...result,
      message: [
         `${companies.length} in, ${tally(scored as Array<{ tier?: string | null }>).join(', ')}, ${left.length} to Else.`,
         unread > 0 ? `${unread} were not read, so they are scored on what the page shows.` : undefined,
      ]
         .filter(Boolean)
         .join(' '),
   }
}

const companyKey = (item: PersonItem) => item.company?.trim().toLowerCase() || null

const roleOf = (item: PersonItem) => item.tags.find(tag => tag.startsWith('role:')) ?? null

export const bestPerCompany = async (ctx: Context): Promise<StepResult> => {
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const config = configOf(ctx.node)
   const per = numberIn(config, 'perCompany')
   const { kept, rest } = pickBestPer(
      people,
      companyKey,
      item => item.score ?? -1,
      roleOf,
      per,
      config.spread !== false
   )

   await WorkflowRunService.replaceItems(
      elseKey(ctx, ctx.node.id),
      aside(rest, 'bestPer', `More than ${per} at this company.`)
   )

   const result = await keepItems(ctx, kept, people.length)

   return {
      ...result,
      message: `${people.length} in, ${kept.length} on, ${rest.length} to Else, ${new Set(people.map(companyKey).filter(Boolean)).size} companies.`,
   }
}

const newer = (a: Date | null, b: Date | null) => (a && (!b || a > b) ? a : b)

export const spaceOut = async (ctx: Context, now = new Date()): Promise<StepResult> => {
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const config = configOf(ctx.node)
   const options = {
      daysApart: numberIn(config, 'daysApart'),
      stopAfterReply: config.stopAfterReply !== false,
      forDays: numberIn(config, 'forDays'),
      now,
   }
   const known = await ColleaguesService.ofCompanies(
      ctx.run.userId,
      people.flatMap(item => companyKey(item) ?? [])
   )
   // The best-scored person of a company in this run goes first; the first of equals wins.
   const first = new Map<string, PersonItem>()

   for (const item of people) {
      const key = companyKey(item)
      const held = key === null ? undefined : first.get(key)

      if (key !== null && (!held || (item.score ?? -1) > (held.score ?? -1))) {
         first.set(key, item)
      }
   }

   const onward: PersonItem[] = []
   const out = new Map<string, PersonItem[]>()

   for (const item of people) {
      const key = companyKey(item)

      if (key === null) {
         onward.push(item)

         continue
      }

      const others: Colleague[] = (known.get(key) ?? []).filter(({ slug }) => slug !== item.slug)
      const reason = spaceOutReason(
         others.reduce<{ lastContactAt: Date | null; lastReplyAt: Date | null }>(
            (all, each) => ({
               lastContactAt: newer(all.lastContactAt, each.lastContactAt),
               lastReplyAt: newer(all.lastReplyAt, each.lastReplyAt),
            }),
            {
               lastContactAt: null,
               lastReplyAt: null,
            }
         ),
         options,
         first.get(key) === item
      )

      if (reason) {
         out.set(reason, [...(out.get(reason) ?? []), item])
      } else {
         onward.push(item)
      }
   }

   const rest = [...out].flatMap(([reason, items]) => aside(items, 'spaceOut', reason))

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), rest)

   const result = await keepItems(ctx, onward, people.length)

   return {
      ...result,
      message: `${people.length} in, ${onward.length} on, ${rest.length} to Else${
         out.size > 0
            ? ` (${[...out].map(([reason, items]) => `${items.length} ${reason.replace(/\.$/, '').toLowerCase()}`).join(', ')})`
            : ''
      }.`,
   }
}

const stoppedItem = (item: PersonItem, status: string, reason: string, now: Date): PersonItem => ({
   ...item,
   result: {
      action: 'stop',
      status,
      account: null,
      at: now.toISOString(),
      reason,
   },
})

export const stopContacting = async (ctx: Context, now = new Date()): Promise<StepResult> => {
   const { userId } = ctx.run
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const reason = String(configOf(ctx.node).reason ?? '')
   const already = await WorkflowListService.seenAmong(
      userId,
      people.map(({ slug }) => slug),
      {
         lists: false,
         profiles: false,
      }
   )
   const nameless = people.filter(({ slug }) => slug === '')
   const done = people.filter(({ slug }) => slug !== '' && already.has(slug))
   const targets = people.filter(({ slug }) => slug !== '' && !already.has(slug))

   if (!ctx.preview) {
      await PeopleService.stopContacting(
         userId,
         targets.map(({ slug }) => slug)
      )
   }

   const items: WorkflowItemData[] = [
      ...targets.map(item => stoppedItem(item, ctx.preview ? 'PLANNED' : 'DONE', reason, now)),
      ...done.map(item => stoppedItem(item, 'SKIPPED', 'Already stopped.', now)),
      ...nameless.map(item => stoppedItem(item, 'SKIPPED', 'No profile link.', now)),
   ]
   const result = await keepItems(ctx, items, people.length)

   return {
      ...result,
      message: `${people.length} in, ${targets.length} ${ctx.preview ? 'would be stopped' : 'stopped'}, ${done.length} already stopped${
         nameless.length > 0 ? `, ${nameless.length} with no profile link` : ''
      }.`,
   }
}
