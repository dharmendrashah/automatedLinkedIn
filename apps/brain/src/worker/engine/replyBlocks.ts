import { type ConversationItem, type ItemResult, type PersonItem } from 'core'

import {
   AccountActionService,
   LinkedInReplyService,
   ReplyActService,
   VisitPoolService,
   WorkflowListService,
   WorkflowRunService,
} from 'database'

import { accountIdsOf, timeLimitMs } from './accountPool'
import { actFrame } from './actFrame'
import {
   type Context,
   StepError,
   type StepResult,
   Waiting,
   configOf,
   conversationsOf,
   numberIn,
   peopleOf,
   textIn,
} from './context'
import { refusalOf } from './visitRefusal'

// "Send message" and "Reply in a conversation" (.plan/account-action-blocks.md): both write through the owner's reply queue, which keeps
// the daily limits (40 replies and 15 first messages a day for an account, 5 waiting at a time) and sends one by one with a quiet gap.
// So the step asks as many as the queue takes, waits for them to go, and asks the rest on its next tick. A message that may have gone
// ends as UNKNOWN and is never asked again. Nothing goes in a preview, or until "Act for real" is switched on.

// The domain's sentences for the day's limit: what is not sent by then is left for the next run, not waited for.
const LIMIT = /in 24 hours/

type Target = { slug: string; accountId: string; ask: () => Promise<{ id: string } | null> }

// For each item either why it is left out, or how to ask for it.
type Plan = { skips: Map<string, string>; targets: Target[] }

// The words with the person's name and company put in; an empty one leaves no gap.
export const fillWords = (text: string, who: { name: string | null; company: string | null }) => {
   const [first = ''] = (who.name ?? '').trim().split(/\s+/)

   return text
      .replaceAll('{first_name}', first)
      .replaceAll('{company}', who.company ?? '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ +([,.!?;:])/g, '$1')
      .trim()
}

const count = (results: Map<string, ItemResult>, status: string) =>
   [...results.values()].filter(result => result.status === status).length

type Frame<T extends PersonItem | ConversationItem> = ReturnType<typeof actFrame<T>>

const runWriting = async <T extends PersonItem | ConversationItem>(
   ctx: Context,
   frame: Frame<T>,
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
                    reason: 'It is not one the chosen accounts can write to.',
                 }))
         } catch (error) {
            const refusal = refusalOf(error)

            if (!refusal) {
               throw error
            }

            if (LIMIT.test(error instanceof Error ? error.message : '')) {
               await AccountActionService.ask(run.id, node.id, slug, accountId, 'FAILED', {
                  status: 'LEFT',
                  reason: 'The account reached its limit for today. Left for the next run.',
               })
            } else if (refusal.kind === 'blocked') {
               await AccountActionService.ask(run.id, node.id, slug, accountId, 'FAILED', {
                  status: 'LEFT',
                  reason: `Not sent: ${refusal.text}.`,
               })
            }
            // Any other refusal (the queue is full, the account is busy) leaves it for the next tick.
         }
      }

      calls = await AccountActionService.ofStep(run.id, node.id)
   }

   const refs = calls.flatMap(call => (call.state === 'ASKED' && call.result.ref ? [call.result.ref] : []))
   const standing: Awaited<ReturnType<typeof ReplyActService.standing>> =
      refs.length > 0 ? await ReplyActService.standing(run.userId, refs) : new Map()
   const results = new Map<string, ItemResult>()

   for (const call of calls) {
      const now = call.state === 'ASKED' ? standing.get(call.result.ref ?? '') : undefined
      const account = call.accountId === '' ? null : call.accountId

      if (now?.status === 'DONE') {
         await AccountActionService.settle(call.id, 'DONE', { status: 'SENT' })
         results.set(call.slug, result('SENT', null, account))
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
         results.set(call.slug, result(call.result.status ?? 'SENT', call.result.reason ?? null, account))
      } else if (call.state === 'FAILED') {
         results.set(call.slug, result(call.result.status ?? 'FAILED', call.result.reason ?? null, account))
      }
   }

   const inFlight = calls.filter(call => !results.has(call.slug)).length
   const unasked = items.filter(({ slug }) => !results.has(slug) && !calls.some(call => call.slug === slug)).length

   if (!stopped && !expired && (inFlight > 0 || unasked > 0)) {
      const note = `Waiting for ${inFlight + unasked} of ${items.length} to be sent.`

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

   const sent = count(results, 'SENT')
   const gaps = items.length - sent

   return give(
      results,
      gaps > 0 ? 'PARTIAL' : 'DONE',
      `${stopped ? 'Stopped by you. ' : ''}Sent ${sent} of ${items.length}${
         gaps > 0 ? `: ${gaps} not sent, see each result` : ''
      }.`
   )
}

export const sendMessages = async (ctx: Context): Promise<StepResult> => {
   const { run, node } = ctx
   const config = configOf(node)
   const text = textIn(config, 'text')
   const hours = numberIn(config, 'notAgainHours')

   return runWriting(
      ctx,
      actFrame(
         ctx,
         'sendMessage',
         {
            verb: 'sends',
            past: 'sent',
            needsArm: true,
         },
         peopleOf
      ),
      async (people, usable) => {
         const slugs = people.map(({ slug }) => slug)
         const [blocked, via, recent, companies] = await Promise.all([
            WorkflowListService.seenAmong(run.userId, slugs, {
               lists: false,
               profiles: false,
            }),
            ReplyActService.connectedVia(run.userId, usable, slugs),
            hours > 0
               ? ReplyActService.recent(run.userId, hours, {
                    conversationIds: [],
                    accountIds: usable,
                    slugs,
                 })
               : Promise.resolve(new Set<string>()),
            ReplyActService.companies(run.userId, slugs),
         ])
         const plan: Plan = {
            skips: new Map(),
            targets: [],
         }

         for (const person of people) {
            const accountId = via.get(person.slug)

            if (blocked.has(person.slug)) {
               plan.skips.set(person.slug, 'On your do-not-contact list.')
            } else if (!accountId) {
               plan.skips.set(person.slug, 'Not connected to any of the chosen accounts.')
            } else if (recent.has(`${accountId}:${person.slug}`)) {
               plan.skips.set(person.slug, `Written to in the last ${hours} hours.`)
            } else {
               plan.targets.push({
                  slug: person.slug,
                  accountId,
                  ask: () =>
                     LinkedInReplyService.start(
                        run.userId,
                        accountId,
                        person.slug,
                        fillWords(text, {
                           name: person.name,
                           company: person.company ?? companies.get(person.slug) ?? null,
                        })
                     ),
               })
            }
         }

         return plan
      }
   )
}

export const replyToConversations = async (ctx: Context): Promise<StepResult> => {
   const { run, node } = ctx
   const config = configOf(node)
   const text = textIn(config, 'text')
   const hours = numberIn(config, 'notAgainHours')

   return runWriting(
      ctx,
      actFrame(
         ctx,
         'replyToConversation',
         {
            verb: 'replies',
            past: 'sent',
            needsArm: true,
         },
         conversationsOf
      ),
      async (conversations, usable) => {
         const ids = conversations.map(({ slug }) => slug)
         const personSlugs = conversations.flatMap(({ personSlug }) => (personSlug ? [personSlug] : []))
         const [rows, blocked, recent, companies] = await Promise.all([
            ReplyActService.conversations(run.userId, ids),
            WorkflowListService.seenAmong(run.userId, personSlugs, {
               lists: false,
               profiles: false,
            }),
            hours > 0
               ? ReplyActService.recent(run.userId, hours, {
                    conversationIds: ids,
                    accountIds: [],
                    slugs: [],
                 })
               : Promise.resolve(new Set<string>()),
            ReplyActService.companies(run.userId, personSlugs),
         ])
         const rowOf = new Map(rows.map(row => [row.id, row]))
         const plan: Plan = {
            skips: new Map(),
            targets: [],
         }

         for (const conversation of conversations) {
            const row = rowOf.get(conversation.slug)

            if (!row) {
               plan.skips.set(conversation.slug, 'Not one of your conversations.')
            } else if (!usable.includes(row.accountId)) {
               plan.skips.set(conversation.slug, 'Not in the chosen accounts.')
            } else if (conversation.personSlug && blocked.has(conversation.personSlug)) {
               plan.skips.set(conversation.slug, 'On your do-not-contact list.')
            } else if (config.onlyIfTheyWroteLast !== false && row.lastDirection !== 'THEM') {
               plan.skips.set(conversation.slug, 'They did not write last.')
            } else if (recent.has(conversation.slug)) {
               plan.skips.set(conversation.slug, `Written in the last ${hours} hours.`)
            } else {
               plan.targets.push({
                  slug: conversation.slug,
                  accountId: row.accountId,
                  ask: () =>
                     LinkedInReplyService.send(
                        run.userId,
                        conversation.slug,
                        fillWords(text, {
                           name: conversation.name,
                           company: conversation.personSlug ? (companies.get(conversation.personSlug) ?? null) : null,
                        })
                     ),
               })
            }
         }

         return plan
      }
   )
}
