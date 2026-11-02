import { type ItemResult } from 'core'

import { AccountActionService, LinkedInInviteService, VisitPoolService, WorkflowListService } from 'database'

import { accountIdsOf } from './accountPool'
import { actFrame } from './actFrame'
import { type Context, StepError, type StepResult, configOf, textIn } from './context'
import { refusalOf } from './visitRefusal'

// "Send connection request" and "Withdraw connection request" (.plan/account-action-blocks.md): both go through the invite planner
// of My network, which spreads the sending over the days inside the account's limits, so a step ends when the invites are planned
// (or taken back), not when LinkedIn has them. Nothing goes in a preview, or until "Act for real" is switched on (send).

const count = (results: Map<string, ItemResult>, status: string) =>
   [...results.values()].filter(result => result.status === status).length

export const sendInvites = async (ctx: Context): Promise<StepResult> => {
   const { run, node } = ctx
   const note = textIn(configOf(node), 'note')
   const { people, result, give, holdBack } = actFrame(ctx, 'sendInvite', {
      verb: 'sends',
      past: 'sent',
      needsArm: true,
   })
   const held = await holdBack()

   if (held) {
      return held
   }

   const accounts = await VisitPoolService.accounts(run.userId, accountIdsOf(ctx))
   const usable = accounts.filter(({ status }) => status === 'ACTIVE').map(({ id }) => id)
   const results = new Map<string, ItemResult>()

   // What an earlier pass of this step already planned is not planned again.
   for (const call of await AccountActionService.ofStep(run.id, node.id)) {
      results.set(
         call.slug,
         result(call.result.status ?? 'PLANNED', call.result.reason ?? null, call.accountId, call.result.at)
      )
   }

   const rest = people.filter(({ slug }) => !results.has(slug))

   if (rest.length > 0 && usable.length === 0) {
      throw new StepError('None of the chosen accounts can act now: they need to be signed in.', 'ACCOUNTS_SIGNED_OUT')
   }

   const blocked = await WorkflowListService.seenAmong(
      run.userId,
      rest.map(({ slug }) => slug),
      {
         lists: false,
         profiles: false,
      }
   )

   for (const slug of blocked) {
      results.set(slug, result('SKIPPED', 'On your do-not-contact list.'))
   }

   const askable = rest.filter(({ slug }) => !blocked.has(slug))

   // The accounts take turns: each person goes to one account, spread evenly.
   for (const [index, accountId] of usable.entries()) {
      const mine = askable.filter((_, position) => position % usable.length === index)

      if (mine.length === 0) {
         continue
      }

      try {
         const made = await LinkedInInviteService.inviteFrom(
            run.userId,
            accountId,
            mine.map(({ slug, name, company }) => ({
               slug,
               name,
               company,
            })),
            note
         )

         for (const outcome of made?.outcomes ?? []) {
            const status = outcome.state === 'QUEUED' ? 'PLANNED' : outcome.state
            const at = outcome.plannedAt?.toISOString() ?? null

            await AccountActionService.ask(run.id, node.id, outcome.slug, accountId, 'DONE', {
               status,
               reason: outcome.reason,
               at,
            })
            results.set(outcome.slug, result(status, outcome.reason, accountId, at))
         }
      } catch (error) {
         if (!refusalOf(error)) {
            throw error
         }

         for (const { slug } of mine) {
            results.set(slug, result('LEFT', 'The account could not send now: it needs to be signed in.', accountId))
         }
      }
   }

   const planned = count(results, 'PLANNED')
   const gaps = people.length - planned

   return give(
      results,
      gaps > 0 ? 'PARTIAL' : 'DONE',
      `Planned ${planned} of ${people.length} connection requests, sent over the coming days inside each account's limits${
         gaps > 0 ? `; ${gaps} not planned, see each person's result` : ''
      }.`
   )
}

export const withdrawInvites = async (ctx: Context): Promise<StepResult> => {
   const { run } = ctx
   const { people, result, give, holdBack } = actFrame(ctx, 'withdrawInvite', {
      verb: 'withdraws',
      past: 'withdrawn',
      needsArm: false,
   })
   const held = await holdBack()

   if (held) {
      return held
   }

   const accounts = await VisitPoolService.accounts(run.userId, accountIdsOf(ctx))
   const taken = await LinkedInInviteService.withdraw(
      run.userId,
      accounts.map(({ id }) => id),
      people.map(({ slug }) => slug)
   )
   const results = new Map<string, ItemResult>()

   for (const { slug } of people) {
      const one = taken.get(slug)

      results.set(
         slug,
         !one
            ? result('SKIPPED', 'No pending connection request from the chosen accounts.')
            : one.taken === 'CANCELLED'
              ? result('CANCELLED', 'It had not gone yet and was taken back.', one.accountId)
              : result('PLANNED', 'Queued to be withdrawn on the account\u2019s next run.', one.accountId)
      )
   }

   const done = count(results, 'PLANNED') + count(results, 'CANCELLED')
   const gaps = people.length - done

   return give(
      results,
      gaps > 0 ? 'PARTIAL' : 'DONE',
      `Took back ${done} of ${people.length} connection requests${
         gaps > 0 ? `; ${gaps} had none pending, see each person's result` : ''
      }.`
   )
}
