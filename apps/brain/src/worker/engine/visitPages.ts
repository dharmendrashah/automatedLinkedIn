import { type WorkflowItemData } from 'core'

import {
   PageVisitRefusedError,
   PageVisitService,
   TaskRefusedError,
   VisitPoolService,
   WorkflowListService,
   idleFirst,
} from 'database'

import { nodeBefore } from '@automatedLinkedIn/contracts'

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

// "Select accounts" and the two visit blocks (.plan/select-accounts-block.md). A visit block hands each person or company to
// the chosen account that went longest without a visit, as accounts become free, and waits until every visit ended.
// Each account keeps its own limits: a refusal only means that account is not free now. Messages are shown to the client.

type Kind = 'PROFILE' | 'COMPANY'

const HOUR_MS = 60 * 60 * 1000
// A visit block gives up after this long (from the run's start) and leaves the rest for the next run.
const TIME_LIMIT_MS = 8 * HOUR_MS

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

// Where one person or company stands for this block, from the visits it already asked for.
const standing = (rows: Row[]) => ({
   done: rows.some(({ status }) => status === 'DONE'),
   unavailable: rows.some(({ status }) => status === 'NOT_AVAILABLE'),
   asked: rows.some(({ status }) => status === 'ASKED'),
   failedOn: new Set(rows.filter(({ status }) => status === 'FAILED').map(({ accountId }) => accountId)),
})

const count = (n: number, text: string) => (n > 0 ? [`${n} ${text}`] : [])

const view = async (ctx: Context, kind: Kind): Promise<StepResult> => {
   const pool = nodeBefore(ctx.graph, ctx.node.id, 'account.select')

   if (!pool) {
      throw new StepError('This block needs "Select accounts" before it.')
   }

   const { run, node, deps } = ctx
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

      return !state.done && !state.unavailable && !state.asked && state.failedOn.size < 2
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
   const expired = Date.now() - run.startedAt.getTime() > TIME_LIMIT_MS
   const open = pending.filter(({ slug }) => !suppressed.has(slug) && !viewed.has(slug))
   const ask = !stopped && !expired
   const unavailable = new Set<string>()
   const last = ask ? await VisitPoolService.lastVisits(usable) : new Map<string, Date>()
   const skipped = new Set<string>()
   const noOther = new Set<string>()
   let asked = 0
   let waiting = 0

   for (const item of ask ? open : []) {
      const candidates = usable.filter(id => !stateOf(item.slug).failedOn.has(id))
      let outcome: 'asked' | 'wait' | 'skip' = 'skip'

      if (candidates.length === 0) {
         noOther.add(item.slug)
         continue
      }

      for (const id of idleFirst(candidates, last)) {
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

            if (!(error instanceof TaskRefusedError)) {
               throw error
            }

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
      throw new Waiting()
   }

   const notAvailable = items.filter(({ slug }) => stateOf(slug).unavailable).length
   const failed = items.filter(({ slug }) => stateOf(slug).failedOn.size >= 2).length + noOther.size
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

   return {
      ...(await keepItems(ctx, visited, items.length)),
      status: notAvailable + failed + left > 0 ? 'PARTIAL' : 'DONE',
      message,
   }
}

export const visitProfile = (ctx: Context) => view(ctx, 'PROFILE')

export const visitCompany = (ctx: Context) => view(ctx, 'COMPANY')
