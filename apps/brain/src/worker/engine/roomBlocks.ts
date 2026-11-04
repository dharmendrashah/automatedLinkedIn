import { type PersonItem, type WorkflowItemData, mergeBySlug } from 'core'

import { type PersonDates, PersonDatesService, type RoomAction, RoomTodayService, WorkflowRunService } from 'database'

import { ROOM_KIND, toSeconds } from '@automatedLinkedIn/contracts'

import { accountIdsOf } from './accountPool'
import {
   type Context,
   type StepResult,
   aside,
   configOf,
   elseKey,
   keepItems,
   numberIn,
   peopleOf,
   textIn,
} from './context'
import { extraSeconds } from './personWaitRules'

// "Fit to today's limit" and "Wait per person" (.plan/lead-pipeline-p1-foundations.md): two gates that keep what is not ready or not
// allowed yet for an Else after them, with one fixed sentence, so nothing is lost.

const ACTIONS: RoomAction[] = ['invite', 'message', 'reply', 'reaction', 'comment']

const actionOf = (value: string): RoomAction => ACTIONS.find(action => action === value) ?? 'invite'

const scoreOf = (item: WorkflowItemData) => ('score' in item ? (item.score ?? -1) : -1)

// The items in the order the owner chose; the sort is stable, so ties keep the order they arrived in.
const ordered = (items: WorkflowItemData[], orderBy: string, dates: Map<string, PersonDates>) => {
   const moment = (item: WorkflowItemData, key: 'wrote' | 'added', missing: number) =>
      dates.get(item.slug)?.[key]?.getTime() ?? missing
   const key = (item: WorkflowItemData): number => {
      if (orderBy === 'leastEngaged') {
         return moment(item, 'wrote', -Infinity)
      }

      if (orderBy === 'newest') {
         // A person My network does not hold yet is the newest there is.
         return item.kind === 'conversation'
            ? -(item.lastAt ? Date.parse(item.lastAt) : 0)
            : -moment(item, 'added', Infinity)
      }

      return -scoreOf(item)
   }

   return [...items].sort((a, b) => key(a) - key(b) || scoreOf(b) - scoreOf(a))
}

const accountLine = (rooms: Array<{ name: string; left: number; limit: number }>) =>
   rooms.map(({ name, left, limit }) => `${name} ${left} of ${limit} left`).join(', ')

export const fitToRoom = async (ctx: Context): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const action = actionOf(textIn(config, 'action'))
   const kind = ROOM_KIND[action]
   const mine = ctx.inputs.filter(item => item.kind === kind)
   const other = ctx.inputs.filter(item => item.kind !== kind)
   const rooms = await RoomTodayService.forAccounts(ctx.run.userId, await accountIdsOf(ctx), action)
   const open = rooms.filter(({ signedIn }) => signedIn)
   const total = open.reduce((sum, { left }) => sum + left, 0)
   const dates =
      kind === 'profile' && textIn(config, 'orderBy') !== 'score'
         ? await PersonDatesService.forSlugs(
              ctx.run.userId,
              mine.map(({ slug }) => slug)
           )
         : new Map<string, PersonDates>()
   const best = ordered(mine, textIn(config, 'orderBy'), dates)
   const kept = best.slice(0, total)
   const rest = best.slice(total)

   await WorkflowRunService.replaceItems(
      elseKey(ctx, ctx.node.id),
      aside(rest, 'room', open.length === 0 ? 'No account is signed in.' : 'No room left today.')
   )

   const result = await keepItems(ctx, [...kept, ...other], ctx.inputs.length)

   return {
      ...result,
      message: [
         `${mine.length} in, ${kept.length} on, ${rest.length} to Else. Room today: ${total}.`,
         rooms.length > 0 ? `${accountLine(rooms)}.` : undefined,
         other.length > 0 ? `${other.length} of another kind passed on untouched.` : undefined,
      ]
         .filter(Boolean)
         .join(' '),
   }
}

const dateOf = (dates: PersonDates | undefined, after: string) => {
   const moments: Record<string, Date | null | undefined> = {
      accepted: dates?.accepted,
      connected: dates?.connected,
      invited: dates?.invited,
      wrote: dates?.wrote,
      wroteBack: dates?.wroteBack,
      added: dates?.added,
   }

   return moments[after] ?? null
}

export const personWait = async (ctx: Context, now = Date.now()): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const people: PersonItem[] = mergeBySlug(peopleOf(ctx.inputs))
   const dates = await PersonDatesService.forSlugs(
      ctx.run.userId,
      people.map(({ slug }) => slug)
   )
   const after = textIn(config, 'after')
   const atLeast = toSeconds(numberIn(config, 'atLeast'), textIn(config, 'atLeastUnit'))
   const plus = toSeconds(numberIn(config, 'plusUpTo'), textIn(config, 'plusUpToUnit'))
   const hold = textIn(config, 'ifNoDate') === 'hold'
   const due: PersonItem[] = []
   const notDue: PersonItem[] = []
   const noDate: PersonItem[] = []

   for (const item of people) {
      const date = dateOf(dates.get(item.slug), after)

      if (!date && hold) {
         noDate.push(item)
      } else if (!date || date.getTime() + (atLeast + extraSeconds(item.slug, ctx.node.id, plus)) * 1000 <= now) {
         due.push(item)
      } else {
         notDue.push(item)
      }
   }

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), [
      ...aside(notDue, 'wait', 'Not due yet.'),
      ...aside(noDate, 'wait', 'No date yet.'),
   ])

   const result = await keepItems(ctx, due, people.length)
   const left = notDue.length + noDate.length

   return {
      ...result,
      message: `${people.length} in, ${due.length} on, ${left} to Else${
         left === 0
            ? ''
            : noDate.length > 0
              ? ` (${notDue.length} not due yet, ${noDate.length} with no date)`
              : ' (not due yet)'
      }.`,
   }
}
