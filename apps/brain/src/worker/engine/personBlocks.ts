import { type PersonItem, mergeBySlug } from 'core'

import { PersonStateService, VisitPoolService, WorkflowRunService } from 'database'

import {
   MAX_POOL,
   type PersonFactValue,
   checkPerson,
   personConditionsOf,
   personFactOf,
   personReason,
} from '@automatedLinkedIn/contracts'

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
import { onMainSide } from './splitRules'

// "If person state", "Get our chat with them" and "Split people" (.plan/lead-pipeline-p2-checks.md). The first two read only what is
// stored; none opens LinkedIn or costs anything.

// The accounts a block looks at: any signed-in account of the owner (the default), the ones of "Select accounts", or one.
export const storedAccountsOf = async (ctx: Context) =>
   textIn(configOf(ctx.node), 'accountMode') === 'any'
      ? (await VisitPoolService.everySignedIn(ctx.run.userId, MAX_POOL)).ids
      : accountIdsOf(ctx)

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

export const ifPerson = async (ctx: Context, now = new Date()): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const conditions = personConditionsOf(config)
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const other = ctx.inputs.filter(({ kind }) => kind !== 'profile')
   const accountIds = await storedAccountsOf(ctx)
   const facts =
      accountIds.length === 0
         ? new Map<string, Record<string, PersonFactValue>>()
         : await PersonStateService.facts(
              ctx.run.userId,
              people.map(({ slug }) => slug),
              {
                 accountIds,
                 maxAgeHours: numberIn(config, 'maxAgeHours') || 36,
              },
              now
           )
   const passed: PersonItem[] = []
   const rest: PersonItem[] = []
   const reasons = new Map<string, string>()
   let notKnown = 0

   for (const person of people) {
      const own = facts.get(person.slug) ?? {}
      const checks = conditions.map(condition => ({
         condition,
         check: checkPerson(condition, own),
      }))
      const test = config.match === 'any' ? 'some' : 'every'

      if (accountIds.length > 0 && checks[test](({ check }) => check === 'match')) {
         passed.push(person)

         continue
      }

      // A fact that could not be answered is named before one that said no: it could have matched.
      const failed =
         checks.find(({ check }) => check === 'unknown') ?? checks.find(({ check }) => check !== 'match') ?? checks[0]
      const unknown = accountIds.length === 0 || failed?.check === 'unknown'

      notKnown += unknown ? 1 : 0
      reasons.set(
         person.slug,
         accountIds.length === 0
            ? 'Not known: no account is signed in.'
            : personReason(personFactOf(failed?.condition.fact ?? ''), failed?.check === 'unknown' ? 'unknown' : 'no')
      )
      rest.push(person)
   }

   await WorkflowRunService.replaceItems(
      elseKey(ctx, ctx.node.id),
      rest.flatMap(person => {
         const [left] = aside([person], 'ifPerson', reasons.get(person.slug) ?? 'Did not match.')

         return left ? [left] : []
      })
   )

   const result = await keepItems(ctx, [...passed, ...other], ctx.inputs.length)

   return {
      ...result,
      message: `${people.length} in, ${passed.length} on, ${rest.length} to Else${
         notKnown > 0
            ? ` (${plural(notKnown, 'person was', 'people were')} not known: read the account's connections or conversations first)`
            : ''
      }.`,
   }
}

export const getChat = async (ctx: Context, now = new Date()): Promise<StepResult> => {
   const config = configOf(ctx.node)
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const other = ctx.inputs.filter(({ kind }) => kind !== 'profile')
   const accountIds = await storedAccountsOf(ctx)
   const age = textIn(config, 'maxAgeDays')
   const chats = await PersonStateService.chats(
      ctx.run.userId,
      people.map(({ slug }) => slug),
      {
         accountIds,
         maxAgeDays: age === 'any' || age === '' ? null : Number(age),
      },
      now
   )
   const given = people.map(person => {
      const chat = chats.get(person.slug)

      return chat
         ? {
              ...person,
              chat,
           }
         : person
   })
   const stored = given.filter(({ chat }) => chat?.stored === true).length
   const unread = given.filter(({ chat }) => chat === undefined || chat.stored === null).length
   const result = await keepItems(ctx, [...given, ...other], ctx.inputs.length)

   return {
      ...result,
      message: `${plural(people.length, 'person', 'people')}: ${stored} ${stored === 1 ? 'has' : 'have'} a stored chat, ${
         people.length - stored - unread
      } none stored, ${unread} not read. "None stored" does not mean none exist.`,
   }
}

export const splitPeople = async (ctx: Context): Promise<StepResult> => {
   const percent = numberIn(configOf(ctx.node), 'percent') || 50
   const on = ctx.inputs.filter(({ slug }) => onMainSide(slug, ctx.node.id, percent))
   const rest = ctx.inputs.filter(({ slug }) => !onMainSide(slug, ctx.node.id, percent))

   await WorkflowRunService.replaceItems(elseKey(ctx, ctx.node.id), rest)

   const result = await keepItems(ctx, on, ctx.inputs.length)

   return {
      ...result,
      message: `${ctx.inputs.length} in, ${on.length} on, ${rest.length} to Else (about ${percent} percent go on).`,
   }
}
