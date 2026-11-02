import { type ItemResult, type PersonItem } from 'core'

import {
   AccountActionService,
   InvitationAnswerService,
   VisitPoolService,
   WorkflowListService,
   WorkflowRunService,
} from 'database'

import { accountIdsOf, timeLimitMs } from './accountPool'
import { type Context, StepError, type StepResult, Waiting, configOf, keepItems, peopleOf, textIn } from './context'
import { refusalOf } from './visitRefusal'

// "Answer connection requests" (.plan/account-action-blocks.md): accepts or ignores the requests the people that reach it sent to the
// owner, with the account that received each. The domain service keeps the limits (10 a run, 50 a day for an account). Nothing is
// answered in a preview, or until the owner switched "Act for real" on.

const ACTION = 'answerRequest'
// The domain's sentences for the day's limit: what is not answered by then is left for the next run, not waited for.
const LIMIT = /answers for today|more today/

const resultOf = (status: string, reason: string | null = null, account: string | null = null): ItemResult => ({
   action: ACTION,
   status,
   account,
   at: null,
   reason,
})

const bySlug = (people: PersonItem[]) => [...new Map(people.map(person => [person.slug, person])).values()]

export const answerRequests = async (ctx: Context): Promise<StepResult> => {
   const { run, node } = ctx
   const config = configOf(node)
   const action = textIn(config, 'action') === 'ignore' ? 'IGNORE' : 'ACCEPT'
   const people = bySlug(peopleOf(ctx.inputs))
   const give = async (results: Map<string, ItemResult>, status: StepResult['status'], message: string) => ({
      ...(await keepItems(
         ctx,
         people.map(person => ({
            ...person,
            result: results.get(person.slug) ?? resultOf('SKIPPED', 'Nothing was asked for them.'),
         })),
         people.length
      )),
      status,
      message,
   })
   const all = (status: string, reason: string) => new Map(people.map(({ slug }) => [slug, resultOf(status, reason)]))

   if (ctx.preview) {
      return give(all('NOT_ASKED', 'A preview answers nothing.'), 'DONE', 'A preview answers nothing.')
   }

   if (config.actForReal !== true) {
      return give(
         all('NOT_ASKED', 'Act for real is off.'),
         'DONE',
         'Act for real is off, so nothing was answered. Switch it on after a preview.'
      )
   }

   const stopped = run.stopRequestedAt !== null
   const expired = Date.now() - (ctx.step.startedAt ?? run.startedAt).getTime() > timeLimitMs(ctx)
   const accounts = await VisitPoolService.accounts(run.userId, accountIdsOf(ctx))
   const usable = accounts.filter(({ status }) => status === 'ACTIVE').map(({ id }) => id)
   let calls = await AccountActionService.ofStep(run.id, node.id)

   if (usable.length === 0 && calls.length === 0 && !stopped) {
      throw new StepError('None of the chosen accounts can act now: they need to be signed in.', 'ACCOUNTS_SIGNED_OUT')
   }

   const slugs = people.map(({ slug }) => slug)
   const blocked = await WorkflowListService.seenAmong(run.userId, slugs, {
      lists: false,
      profiles: false,
   })
   const results = new Map<string, ItemResult>()

   for (const slug of blocked) {
      results.set(slug, resultOf('SKIPPED', 'On your do-not-contact list.'))
   }

   const asked = new Set(calls.map(call => call.slug))
   const rows = await InvitationAnswerService.pending(
      run.userId,
      usable,
      slugs.filter(slug => !blocked.has(slug) && !asked.has(slug))
   )
   const rowOf = new Map(rows.map(row => [row.slug, row]))
   let later = 0

   for (const slug of slugs.filter(each => !blocked.has(each) && !asked.has(each) && !rowOf.has(each))) {
      if (usable.length > 0) {
         results.set(slug, resultOf('SKIPPED', 'No waiting request from them in the chosen accounts.'))
      }
   }

   // One run for each account at a time; the rest of its requests go on the next tick, once the account is free again.
   if (!stopped && !expired) {
      for (const accountId of usable) {
         const mine = rows.filter(row => row.accountId === accountId).slice(0, InvitationAnswerService.PER_RUN)

         if (mine.length === 0) {
            continue
         }

         try {
            if (
               await InvitationAnswerService.answer(
                  run.userId,
                  accountId,
                  mine.map(({ id }) => id),
                  action
               )
            ) {
               for (const row of mine) {
                  await AccountActionService.ask(run.id, node.id, row.slug, accountId, 'ASKED', { ref: row.id })
               }
            }
         } catch (error) {
            const refusal = refusalOf(error)

            if (!refusal) {
               throw error
            }

            if (LIMIT.test(error instanceof Error ? error.message : '')) {
               for (const row of mine) {
                  await AccountActionService.ask(run.id, node.id, row.slug, accountId, 'FAILED', {
                     status: 'LEFT',
                     reason: 'The account reached its answers for today. Left for the next run.',
                  })
               }
            } else {
               later += mine.length
            }
         }
      }

      calls = await AccountActionService.ofStep(run.id, node.id)
   }

   // What the asked requests came to.
   const refs = calls.flatMap(call => (call.state === 'ASKED' && call.result.ref ? [call.result.ref] : []))
   const standing: Awaited<ReturnType<typeof InvitationAnswerService.standing>> =
      refs.length > 0 ? await InvitationAnswerService.standing(run.userId, refs) : new Map()

   for (const call of calls) {
      const now = call.state === 'ASKED' ? standing.get(call.result.ref ?? '') : undefined

      if (now?.status === 'DONE') {
         await AccountActionService.settle(call.id, 'DONE', { status: action === 'ACCEPT' ? 'ACCEPTED' : 'IGNORED' })
         results.set(call.slug, resultOf(action === 'ACCEPT' ? 'ACCEPTED' : 'IGNORED', null, call.accountId))
      } else if (now?.status === 'UNSURE') {
         await AccountActionService.settle(call.id, 'DONE', {
            status: 'UNKNOWN',
            reason: now.reason,
         })
         results.set(call.slug, resultOf('UNKNOWN', now.reason, call.accountId))
      } else if (now?.status === 'FAILED') {
         await AccountActionService.settle(call.id, 'FAILED', {
            status: 'FAILED',
            reason: now.reason,
         })
         results.set(call.slug, resultOf('FAILED', now.reason, call.accountId))
      } else if (call.state === 'DONE') {
         results.set(call.slug, resultOf(call.result.status ?? 'ACCEPTED', call.result.reason ?? null, call.accountId))
      } else if (call.state === 'FAILED') {
         results.set(call.slug, resultOf(call.result.status ?? 'FAILED', call.result.reason ?? null, call.accountId))
      }
   }

   const inFlight = calls.filter(call => !results.has(call.slug)).length
   const unasked = slugs.filter(slug => !results.has(slug) && !calls.some(call => call.slug === slug)).length

   if (!stopped && !expired && (inFlight > 0 || later > 0 || unasked > 0)) {
      const note = `Waiting for ${inFlight + later + unasked} of ${people.length} requests to be answered.`

      if (note !== (ctx.step.message ?? null)) {
         await WorkflowRunService.setNote(ctx.step.id, note)
      }

      throw new Waiting()
   }

   for (const slug of slugs) {
      if (!results.has(slug)) {
         results.set(slug, resultOf('LEFT', 'Left for the next run.'))
      }
   }

   const count = (status: string) => [...results.values()].filter(result => result.status === status).length
   const answered = count('ACCEPTED') + count('IGNORED')
   const gaps = people.length - answered

   return give(
      results,
      gaps > 0 ? 'PARTIAL' : 'DONE',
      `${stopped ? 'Stopped by you. ' : ''}Answered ${answered} of ${people.length} requests${
         gaps > 0 ? `: ${gaps} not answered, see each person's result` : ''
      }.`
   )
}
