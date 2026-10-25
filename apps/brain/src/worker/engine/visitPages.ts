import { type WorkflowItemData } from 'core'

import {
   PageVisitRefusedError,
   PageVisitService,
   VisitPoolService,
   WorkflowListService,
   WorkflowRunService,
   idleFirst,
} from 'database'

import { nodeBefore, retriesOf } from '@automatedLinkedIn/contracts'

import {
   type Context,
   StepError,
   type StepResult,
   Waiting,
   companiesOf,
   configOf,
   keepItems,
   peopleOf,
   wordsIn,
} from './context'
import { type Refusal, deferralOf, refusalOf } from './visitRefusal'

// "Select accounts" and the two visit blocks (.plan/select-accounts-block.md). A visit block hands each person or company to
// the chosen account that went longest without a visit, as accounts become free, and waits until every visit ended.
// Each account keeps its own limits: a refusal only means that account is not free now. Messages are shown to the client.

type Kind = 'PROFILE' | 'COMPANY'

const HOUR_MS = 60 * 60 * 1000
// A visit block gives up after this long (from its own start) and leaves the rest for the next run.
const TIME_LIMIT_MS = 8 * HOUR_MS
// When no account can take a visit for a reason that waiting does not fix, the block ends after this long.
const BLOCKED_LIMIT_MS = 10 * 60_000

const NOUNS: Record<Kind, string> = {
   PROFILE: 'people',
   COMPANY: 'companies',
}

const bySlug = <T extends { slug: string }>(items: T[]) => [...new Map(items.map(item => [item.slug, item])).values()]

const accountIdsOf = (node: Context['node']) => wordsIn(configOf(node), 'accounts')

export const selectAccounts = async (ctx: Context): Promise<StepResult> => {
   const owned = await VisitPoolService.accounts(ctx.run.userId, accountIdsOf(ctx.node))

   if (owned.length === 0) {
      throw new StepError('None of the chosen accounts was found.')
   }

   return keepItems(ctx, ctx.inputs, ctx.inputs.length)
}

type Row = Awaited<ReturnType<typeof VisitPoolService.ofStep>>[number]

// A person gets this many visits before a failure is final; a Retry right after the block adds its own tries.
const BUILT_IN_TRIES = 2

// Where one person or company stands for this block, from the visits it already asked for.
const standing = (rows: Row[]) => {
   const failed = rows.filter(({ status }) => status === 'FAILED')

   return {
      done: rows.some(({ status }) => status === 'DONE'),
      unavailable: rows.some(({ status }) => status === 'NOT_AVAILABLE'),
      asked: rows.some(({ status }) => status === 'ASKED'),
      failures: failed.length,
      lastFailedAt: Math.max(0, ...failed.map(({ createdAt }) => createdAt?.getTime() ?? 0)),
      failedOn: new Set(failed.map(({ accountId }) => accountId)),
   }
}

const count = (n: number, text: string) => (n > 0 ? [`${n} ${text}`] : [])

const view = async (ctx: Context, kind: Kind): Promise<StepResult> => {
   const pool = nodeBefore(ctx.graph, ctx.node.id, 'account.select')

   if (!pool) {
      throw new StepError('This block needs "Select accounts" before it.')
   }

   const { run, node, deps } = ctx
   const retry = retriesOf(ctx.graph, node.id)
   const tries = BUILT_IN_TRIES + (retry?.times ?? 0)
   const items = bySlug<WorkflowItemData>(kind === 'PROFILE' ? peopleOf(ctx.inputs) : companiesOf(ctx.inputs))

   if (ctx.preview) {
      return {
         ...(await keepItems(ctx, items, items.length)),
         message: 'A preview visits nobody.',
      }
   }

   const stopped = run.stopRequestedAt !== null
   const accounts = await VisitPoolService.accounts(run.userId, accountIdsOf(pool))
   const usable = accounts.filter(({ status }) => status === 'ACTIVE').map(({ id }) => id)
   const rows = await VisitPoolService.ofStep(run.id, node.id)

   if (usable.length === 0 && rows.length === 0 && !stopped) {
      throw new StepError('None of the chosen accounts can act now: they need to be signed in.')
   }

   const standings = new Map(items.map(({ slug }) => [slug, standing(rows.filter(row => row.slug === slug))] as const))
   const stateOf = (slug: string) => standings.get(slug) ?? standing([])
   const pending = items.filter(({ slug }) => {
      const state = stateOf(slug)

      return !state.done && !state.unavailable && !state.asked && state.failures < tries
   })
   const slugs = pending.map(({ slug }) => slug)
   const [suppressed, viewed] = await Promise.all([
      kind === 'PROFILE' && slugs.length > 0
         ? WorkflowListService.seenAmong(run.userId, slugs, {
              lists: false,
              profiles: false,
           })
         : new Set<string>(),
      slugs.length > 0
         ? VisitPoolService.viewedBy(
              accounts.map(({ id }) => id),
              kind,
              slugs
           )
         : new Set<string>(),
   ])
   // The step's own start; a step taken before it was saved counts from the run's start.
   const sinceMs = Date.now() - (ctx.step.startedAt ?? run.startedAt).getTime()
   const expired = sinceMs > TIME_LIMIT_MS
   const open = pending.filter(({ slug }) => !suppressed.has(slug) && !viewed.has(slug))
   const ask = !stopped && !expired
   const unavailable = new Set<string>()
   const last = ask ? await VisitPoolService.lastVisits(usable) : new Map<string, Date>()
   const skipped = new Set<string>()
   const noOther = new Set<string>()
   const refused = new Map<string, Refusal>()
   let asked = 0
   let waiting = 0

   // No chosen account is signed in now: nothing can be asked, and that is a reason to say, not a failure of each person.
   const noneSignedIn = ask && usable.length === 0 && open.length > 0

   if (noneSignedIn) {
      waiting = open.length
   }

   for (const item of ask && !noneSignedIn ? open : []) {
      const state = stateOf(item.slug)
      const candidates = usable.filter(id => retry !== null || !state.failedOn.has(id))
      let outcome: 'asked' | 'wait' | 'skip' = 'skip'

      if (candidates.length === 0) {
         noOther.add(item.slug)
         continue
      }

      // The pause before a try that a Retry sets.
      if (state.failures > 0 && state.lastFailedAt + (retry?.waitSeconds ?? 0) * 1000 > Date.now()) {
         waiting += 1
         continue
      }

      // An account that has not failed this one goes first.
      const fresh = candidates.filter(id => !state.failedOn.has(id))
      const order = [
         ...idleFirst(fresh, last),
         ...idleFirst(
            candidates.filter(id => state.failedOn.has(id)),
            last
         ),
      ]

      for (const id of order) {
         if (unavailable.has(id)) {
            outcome = 'wait'
            continue
         }

         try {
            await PageVisitService.request(
               run.userId,
               id,
               {
                  kind,
                  link: item.url,
               },
               undefined,
               {
                  runId: run.id,
                  nodeId: node.id,
               }
            )
            last.set(id, new Date())
            outcome = 'asked'
            break
         } catch (error) {
            if (error instanceof PageVisitRefusedError && error.reason !== 'CAP') {
               if (error.reason === 'OWN') {
                  continue
               }

               break
            }

            const refusal = refusalOf(error)

            if (!refusal) {
               throw error
            }

            refused.set(id, refusal)
            unavailable.add(id)
            outcome = 'wait'
         }
      }

      asked += outcome === 'asked' ? 1 : 0
      waiting += outcome === 'wait' ? 1 : 0

      if (outcome === 'skip') {
         skipped.add(item.slug)
      }
   }

   if (asked > 0) {
      deps.log.info(`workflow run=${run.id} step=${node.id} asked ${asked} visits`)
   }

   const inFlight = items.filter(({ slug }) => stateOf(slug).asked).length
   const visited = items.filter(({ slug }) => stateOf(slug).done)

   if (ask && (inFlight > 0 || asked > 0 || waiting > 0)) {
      const why = [
         ...new Set(
            noneSignedIn
               ? ['an account is not signed in']
               : [...refused.values()]
                    .map(({ text }) => text)
                    .concat(refused.size === 0 ? ['waiting before the next try'] : [])
         ),
      ].join('; ')
      // Out of browsing time for hours: the block is put off until the accounts are back, not asked again every few seconds.
      const deferral =
         waiting > 0 && asked === 0 && inFlight === 0 && !noneSignedIn ? deferralOf(refused, usable) : null
      const note =
         waiting > 0
            ? deferral
               ? `Scheduled ${deferral.when}: ${why}.`
               : `Waiting to visit ${waiting} of ${items.length}: ${why}.`
            : null

      // Said once, and again only when it changes, so a long wait neither fills the log nor hides what is wrong.
      if (note !== (ctx.step.message ?? null)) {
         await WorkflowRunService.setNote(ctx.step.id, note)

         if (note) {
            deps.log.info(`workflow run=${run.id} step=${node.id} ${note}`)
         }
      }

      // Every account is blocked for a reason waiting does not fix: end with it instead of waiting for hours.
      const blocked =
         waiting > 0 &&
         asked === 0 &&
         inFlight === 0 &&
         (noneSignedIn || (refused.size > 0 && usable.every(id => refused.get(id)?.kind === 'blocked')))

      if (blocked && sinceMs > BLOCKED_LIMIT_MS) {
         throw new StepError(`Visits stopped: ${why}.`)
      }

      if (deferral) {
         await WorkflowRunService.setWaitUntil(ctx.step.id, deferral.until)
         // The 8 hours of the block count from the end of the wait, so a night does not use them up.
         await WorkflowRunService.markStarted(ctx.step.id, deferral.until)
      }

      throw new Waiting()
   }

   const notAvailable = items.filter(({ slug }) => stateOf(slug).unavailable).length
   const failed = items.filter(({ slug }) => stateOf(slug).failures >= tries).length + noOther.size
   const left = ask ? 0 : inFlight + open.length
   const reasons = [
      ...count(items.filter(({ slug }) => suppressed.has(slug)).length, 'on your do-not-contact list'),
      ...count(
         items.filter(({ slug }) => !suppressed.has(slug) && viewed.has(slug)).length,
         'viewed in the last 30 days'
      ),
      ...count(skipped.size, 'could not be viewed'),
      ...count(notAvailable, 'not available'),
      ...count(failed, 'failed'),
      ...count(left, 'left for the next run'),
   ]
   const message = `${stopped ? 'Stopped by you. ' : ''}Viewed ${visited.length} of ${items.length} ${NOUNS[kind]}${
      reasons.length > 0 ? `: ${reasons.join(', ')}` : ''
   }.`

   // Everyone the block handled goes on, viewed or not, for a Task result to split (.plan/logic-wait-result-retry.md).
   const handled = items.filter(({ slug }) => {
      const state = stateOf(slug)

      return state.done || state.unavailable || state.failures >= tries || noOther.has(slug)
   })

   return {
      ...(await keepItems(ctx, handled, items.length)),
      status: notAvailable + failed + left > 0 ? 'PARTIAL' : 'DONE',
      message,
   }
}

export const visitProfile = (ctx: Context) => view(ctx, 'PROFILE')

export const visitCompany = (ctx: Context) => view(ctx, 'COMPANY')
