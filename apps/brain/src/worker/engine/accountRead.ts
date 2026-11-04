import { type WorkflowItemData, person } from 'core'

import {
   AccountActionService,
   ConnectionReadService,
   ConversationReadService,
   InvitationReadService,
   VisitPoolService,
   WorkflowRunService,
} from 'database'

import { PREVIEW_LIMITS } from '@automatedLinkedIn/contracts'

import { accountIdsOf, timeLimitMs } from './accountPool'
import { type Context, StepError, type StepResult, Waiting, configOf, keepItems, numberIn } from './context'
import { refusalOf } from './visitRefusal'

// The blocks of Account Actions that read from an account (.plan/account-action-blocks.md): they ask each chosen account's read once,
// wait until the reads ended and were stored, then give what was stored. An account that cannot be read is counted, not fatal.

export type ReadDriver = {
   // What the block gives, in words.
   noun: string
   // Asks the account's read; resolves to false when the account is not the owner's. Throws the refusal when it cannot be asked.
   ask: (userId: string, accountId: string) => Promise<boolean>
   // Where the read stands; a read that ended before `since` is an older one.
   state: (accountId: string, since: Date) => Promise<'RUNNING' | 'DONE' | 'FAILED'>
   // What the accounts' reads gave.
   items: (userId: string, accountIds: string[], take: number) => Promise<WorkflowItemData[]>
}

const count = (n: number, text: string) => (n > 0 ? [`${n} ${text}`] : [])

export const runAccountRead = async (ctx: Context, driver: ReadDriver, howMany: number): Promise<StepResult> => {
   const { run, node } = ctx
   const owned = await VisitPoolService.accounts(run.userId, await accountIdsOf(ctx))

   if (owned.length === 0) {
      throw new StepError('None of the chosen accounts was found.', 'ACCOUNTS_MISSING')
   }

   const ids = owned.map(({ id }) => id)

   if (ctx.preview) {
      return {
         ...(await keepItems(ctx, await driver.items(run.userId, ids, Math.min(howMany, PREVIEW_LIMITS.perPost)), 0)),
         message: 'A preview reads nothing new from LinkedIn; this is what is stored now.',
      }
   }

   const stopped = run.stopRequestedAt !== null
   const expired = Date.now() - (ctx.step.startedAt ?? run.startedAt).getTime() > timeLimitMs(ctx)
   const asking = !stopped && !expired
   const usable = owned.filter(({ status }) => status === 'ACTIVE')
   let calls = await AccountActionService.ofStep(run.id, node.id)

   if (usable.length === 0 && calls.length === 0 && !stopped) {
      throw new StepError('None of the chosen accounts can act now: they need to be signed in.', 'ACCOUNTS_SIGNED_OUT')
   }

   // Each account is asked once; one that cannot be asked yet is tried again on the next tick, one that never can is counted failed.
   const later = new Set<string>()

   if (asking) {
      for (const { id } of usable.filter(account => !calls.some(call => call.accountId === account.id))) {
         try {
            if (await driver.ask(run.userId, id)) {
               await AccountActionService.ask(run.id, node.id, id, id)
            }
         } catch (error) {
            const refusal = refusalOf(error)

            if (!refusal) {
               throw error
            }

            if (refusal.kind === 'blocked') {
               await AccountActionService.ask(run.id, node.id, id, id, 'FAILED')
            } else {
               later.add(id)
            }
         }
      }

      calls = await AccountActionService.ofStep(run.id, node.id)
   }

   const states = new Map<string, string>()

   for (const call of calls) {
      if (call.state === 'ASKED') {
         const state = await driver.state(call.accountId, call.createdAt)

         if (state !== 'RUNNING') {
            await AccountActionService.settle(call.id, state)
         }

         states.set(call.id, state === 'RUNNING' ? 'ASKED' : state)
      } else {
         states.set(call.id, call.state)
      }
   }

   const running = calls.filter(({ id }) => states.get(id) === 'ASKED').length

   if (asking && (running > 0 || later.size > 0)) {
      const note = `Waiting for ${running + later.size} of ${owned.length} accounts to be read.`

      if (note !== (ctx.step.message ?? null)) {
         await WorkflowRunService.setNote(ctx.step.id, note)
      }

      throw new Waiting()
   }

   const doneIds = calls.filter(({ id }) => states.get(id) === 'DONE').map(({ accountId }) => accountId)
   const items = doneIds.length > 0 ? await driver.items(run.userId, doneIds, howMany) : []
   const failed = calls.filter(({ id }) => states.get(id) === 'FAILED').length
   const left = running + later.size + usable.filter(({ id }) => !calls.some(call => call.accountId === id)).length
   const reasons = [...count(failed, 'could not be read'), ...count(left, 'left for the next run')]

   return {
      ...(await keepItems(ctx, items, 0)),
      status: failed + left > 0 ? 'PARTIAL' : 'DONE',
      message: `${stopped ? 'Stopped by you. ' : ''}Read ${items.length} ${driver.noun} from ${doneIds.length} of ${owned.length} accounts${
         reasons.length > 0 ? `: ${reasons.join(', ')}` : ''
      }.`,
   }
}

export const getConnections = (ctx: Context) =>
   runAccountRead(
      ctx,
      {
         noun: 'people',
         ask: ConnectionReadService.ask,
         state: ConnectionReadService.state,
         items: async (userId, accountIds, take) =>
            (await ConnectionReadService.people(userId, accountIds, take)).map(row =>
               person({
                  slug: row.slug,
                  url: row.url,
                  name: row.name,
                  headline: row.headline,
                  connectedOn: row.connectedOn,
                  known: true,
               })
            ),
      },
      numberIn(configOf(ctx.node), 'howMany')
   )

export const getRequests = (ctx: Context) =>
   runAccountRead(
      ctx,
      {
         noun: 'people',
         ask: InvitationReadService.ask,
         state: InvitationReadService.state,
         items: async (userId, accountIds, take) =>
            (await InvitationReadService.people(userId, accountIds, take)).map(row =>
               person({
                  slug: row.slug,
                  url: row.url,
                  name: row.name,
                  headline: row.headline,
                  note: row.note,
               })
            ),
      },
      numberIn(configOf(ctx.node), 'howMany')
   )

export const getConversations = (ctx: Context) =>
   runAccountRead(
      ctx,
      {
         noun: 'conversations',
         ask: ConversationReadService.ask,
         state: ConversationReadService.state,
         items: async (userId, accountIds, take) =>
            (await ConversationReadService.conversations(userId, accountIds, take)).map(row => ({
               kind: 'conversation' as const,
               slug: row.id,
               url: row.url,
               personSlug: row.personSlug,
               name: row.name,
               headline: null,
               lastText: row.lastText,
               lastAt: row.lastAt,
               lastFrom: row.lastFrom,
               unread: row.unread,
            })),
      },
      numberIn(configOf(ctx.node), 'howMany')
   )
