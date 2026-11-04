import { type ItemResult, type WorkflowItemData } from 'core'

import {
   PageVisitRefusedError,
   PageVisitService,
   VisitPoolService,
   WorkflowListService,
   WorkflowRunService,
   idleFirst,
} from 'database'

import { MAX_POOL, retriesOf } from '@automatedLinkedIn/contracts'

import { accountIdsOf, poolOf, timeLimitMs } from './accountPool'
import {
   type Context,
   StepError,
   type StepResult,
   Waiting,
   companiesOf,
   configOf,
   keepItems,
   peopleOf,
} from './context'
import { type Refusal, deferralOf, refusalOf } from './visitRefusal'

// "Select accounts" and the two visit blocks (.plan/select-accounts-block.md). A visit block hands each person or company to
// the chosen account that went longest without a visit, as accounts become free, and waits until every visit ended.
// Each account keeps its own limits: a refusal only means that account is not free now. Messages are shown to the client.

type Kind = 'PROFILE' | 'COMPANY'

// When no account can take a visit for a reason that waiting does not fix, the block ends after this long.
const BLOCKED_LIMIT_MS = 10 * 60_000

const NOUNS: Record<Kind, string> = {
   PROFILE: 'people',
   COMPANY: 'companies',
}

const bySlug = <T extends { slug: string }>(items: T[]) => [...new Map(items.map(item => [item.slug, item])).values()]

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export const selectAccounts = async (ctx: Context): Promise<StepResult> => {
   const all = configOf(ctx.node).scope === 'all'
   const pool = await poolOf(ctx.run.userId, ctx.node)
   const owned = await VisitPoolService.accounts(ctx.run.userId, pool.ids)

   if (!all && owned.length === 0) {
      throw new StepError('None of the chosen accounts was found.', 'ACCOUNTS_MISSING')
   }

   const notSignedIn = all ? pool.notSignedIn : owned.filter(({ status }) => status !== 'ACTIVE').length
   const message = [
      owned.length === 0 ? 'No account is signed in.' : plural(owned.length, 'account'),
      notSignedIn > 0 ? `${notSignedIn} not signed in` : undefined,
      pool.leftOut > 0 ? `${pool.leftOut} left out (at most ${MAX_POOL})` : undefined,
   ]
      .filter(Boolean)
      .join(', ')

   return {
      ...(await keepItems(ctx, ctx.inputs, ctx.inputs.length)),
      message: `${message}.`,
   }
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
   const poolIds = await accountIdsOf(ctx)

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
   const accounts = await VisitPoolService.accounts(run.userId, poolIds)
   const usable = accounts.filter(({ status }) => status === 'ACTIVE').map(({ id }) => id)
   const rows = await VisitPoolService.ofStep(run.id, node.id)

   if (usable.length === 0 && rows.length === 0 && !stopped) {
      throw new StepError('None of the chosen accounts can act now: they need to be signed in.', 'ACCOUNTS_SIGNED_OUT')
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
   const expired = sinceMs > timeLimitMs(ctx)
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
         throw new StepError(`Visits stopped: ${why}.`, 'VISITS_STOPPED')
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

   // What each handled item shows the blocks after it.
   const resultOf = (slug: string): ItemResult => {
      const state = stateOf(slug)

      return {
         action: kind === 'PROFILE' ? 'visitProfile' : 'visitCompany',
         status: state.done ? 'VISITED' : state.unavailable ? 'NOT_AVAILABLE' : 'FAILED',
         account: null,
         at: null,
         reason: null,
      }
   }

   // Everyone the block handled goes on, viewed or not, for a Task result to split (.plan/logic-wait-result-retry.md).
   const handled = items.filter(({ slug }) => {
      const state = stateOf(slug)

      return state.done || state.unavailable || state.failures >= tries || noOther.has(slug)
   })

   return {
      ...(await keepItems(
         ctx,
         handled.map(item => ({
            ...item,
            result: resultOf(item.slug),
         })),
         items.length
      )),
      status: notAvailable + failed + left > 0 ? 'PARTIAL' : 'DONE',
      message,
   }
}

export const visitProfile = (ctx: Context) => view(ctx, 'PROFILE')

export const visitCompany = (ctx: Context) => view(ctx, 'COMPANY')
