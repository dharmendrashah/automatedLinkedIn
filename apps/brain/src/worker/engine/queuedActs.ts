import { type ConversationItem, type ItemResult, type PersonItem } from 'core'

import { AccountActionService, VisitPoolService, WorkflowRunService } from 'database'

import { accountIdsOf, timeLimitMs } from './accountPool'
import { type actFrame } from './actFrame'
import { type Context, StepError, type StepResult, Waiting } from './context'
import { refusalOf } from './visitRefusal'

// What the blocks that ask one account's queue for one item at a time share (.plan/account-action-blocks.md): the messages and
// replies, and the removals of connections. Each item is asked once (a repeated tick never asks twice), the step waits for what was
// asked to end, asks the rest as the queue takes them, and leaves what is left once its time limit passes. What may have gone ends as
// UNKNOWN and is never asked again.

export type Target = { slug: string; accountId: string; ask: () => Promise<{ id: string } | null> }

// For each item either why it is left out, or how to ask for it.
export type Plan = { skips: Map<string, string>; targets: Target[] }

export type Standing = { status: 'WAITING' | 'DONE' | 'FAILED' | 'UNSURE'; reason: string | null; label?: string }

export type Driver = {
   // Where each asked item stands, by the id it was asked under.
   standing: (userId: string, refs: string[]) => Promise<Map<string, Standing>>
   // What an item that went is called, and what it is called in a sentence ("sent": "Sent 1 of 2").
   done: string
   past: string
   // The domain's sentences for the day's limit: what is not done by then is left for the next run, not waited for.
   limit: RegExp
   limitReason: string
}

const capital = (word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

type Frame<T extends PersonItem | ConversationItem> = ReturnType<typeof actFrame<T>>

export const runQueued = async <T extends PersonItem | ConversationItem>(
   ctx: Context,
   frame: Frame<T>,
   driver: Driver,
   plan: (items: T[], usable: string[]) => Promise<Plan>
): Promise<StepResult> => {
   const { run, node } = ctx
   const { items, result, give, holdBack } = frame
   const held = await holdBack()

   if (held) {
      return held
   }

   const stopped = run.stopRequestedAt !== null
   const expired = Date.now() - (ctx.step.startedAt ?? run.startedAt).getTime() > timeLimitMs(ctx)
   const accounts = await VisitPoolService.accounts(run.userId, accountIdsOf(ctx))
   const usable = accounts.filter(({ status }) => status === 'ACTIVE').map(({ id }) => id)
   let calls = await AccountActionService.ofStep(run.id, node.id)

   if (usable.length === 0 && calls.length === 0 && !stopped) {
      throw new StepError('None of the chosen accounts can act now: they need to be signed in.', 'ACCOUNTS_SIGNED_OUT')
   }

   if (!stopped && !expired && usable.length > 0) {
      const asked = new Set(calls.map(call => call.slug))
      const { skips, targets } = await plan(
         items.filter(({ slug }) => !asked.has(slug)),
         usable
      )

      for (const [slug, reason] of skips) {
         await AccountActionService.ask(run.id, node.id, slug, '', 'DONE', {
            status: 'SKIPPED',
            reason,
         })
      }

      for (const { slug, accountId, ask } of targets) {
         try {
            const made = await ask()

            await (made
               ? AccountActionService.ask(run.id, node.id, slug, accountId, 'ASKED', { ref: made.id })
               : AccountActionService.ask(run.id, node.id, slug, accountId, 'DONE', {
                    status: 'SKIPPED',
                    reason: 'It is not one the chosen accounts can act on.',
                 }))
         } catch (error) {
            const refusal = refusalOf(error)

            if (!refusal) {
               throw error
            }

            if (driver.limit.test(error instanceof Error ? error.message : '')) {
               await AccountActionService.ask(run.id, node.id, slug, accountId, 'FAILED', {
                  status: 'LEFT',
                  reason: driver.limitReason,
               })
            } else if (refusal.kind === 'blocked') {
               await AccountActionService.ask(run.id, node.id, slug, accountId, 'FAILED', {
                  status: 'LEFT',
                  reason: `Not ${driver.past}: ${refusal.text}.`,
               })
            }
            // Any other refusal (the queue is full, the account is busy) leaves it for the next tick.
         }
      }

      calls = await AccountActionService.ofStep(run.id, node.id)
   }

   const refs = calls.flatMap(call => (call.state === 'ASKED' && call.result.ref ? [call.result.ref] : []))
   const standing = refs.length > 0 ? await driver.standing(run.userId, refs) : new Map<string, Standing>()
   const results = new Map<string, ItemResult>()

   for (const call of calls) {
      const now = call.state === 'ASKED' ? standing.get(call.result.ref ?? '') : undefined
      const account = call.accountId === '' ? null : call.accountId

      if (now?.status === 'DONE') {
         const status = now.label ?? driver.done

         await AccountActionService.settle(call.id, 'DONE', { status })
         results.set(call.slug, result(status, now.label ? now.reason : null, account))
      } else if (now?.status === 'UNSURE') {
         await AccountActionService.settle(call.id, 'DONE', {
            status: 'UNKNOWN',
            reason: now.reason,
         })
         results.set(call.slug, result('UNKNOWN', now.reason, account))
      } else if (now?.status === 'FAILED') {
         await AccountActionService.settle(call.id, 'FAILED', {
            status: 'FAILED',
            reason: now.reason,
         })
         results.set(call.slug, result('FAILED', now.reason, account))
      } else if (call.state === 'DONE') {
         results.set(call.slug, result(call.result.status ?? driver.done, call.result.reason ?? null, account))
      } else if (call.state === 'FAILED') {
         results.set(call.slug, result(call.result.status ?? 'FAILED', call.result.reason ?? null, account))
      }
   }

   const inFlight = calls.filter(call => !results.has(call.slug)).length
   const unasked = items.filter(({ slug }) => !results.has(slug) && !calls.some(call => call.slug === slug)).length

   if (!stopped && !expired && (inFlight > 0 || unasked > 0)) {
      const note = `Waiting for ${inFlight + unasked} of ${items.length} to be ${driver.past}.`

      if (note !== (ctx.step.message ?? null)) {
         await WorkflowRunService.setNote(ctx.step.id, note)
      }

      throw new Waiting()
   }

   for (const { slug } of items) {
      if (!results.has(slug)) {
         results.set(slug, result('LEFT', 'Left for the next run.'))
      }
   }

   const done = [...results.values()].filter(({ status }) => status === driver.done || status === 'GONE').length
   const gaps = items.length - done

   return give(
      results,
      gaps > 0 ? 'PARTIAL' : 'DONE',
      `${stopped ? 'Stopped by you. ' : ''}${capital(driver.past)} ${done} of ${items.length}${
         gaps > 0 ? `: ${gaps} not ${driver.past}, see each result` : ''
      }.`
   )
}
