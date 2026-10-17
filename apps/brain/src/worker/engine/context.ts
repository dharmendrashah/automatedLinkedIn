import { type CompanyItem, type PersonItem, type PostItem, type WorkflowItemData, readSeniorities } from 'core'
import { type DataClient, DataServiceError } from 'core/dataClient'
import { advanceJob } from 'core/dataJob'

import { IcpService, type ItemKey, WalletService, WorkflowRunService, floorMicros } from 'database'

import { type Graph, type GraphNode, blockOf } from '@automatedLinkedIn/contracts'

import { type Post } from './sendApi'
import { type ScoringRules } from './steps'

// What every step executor shares: the run it belongs to, its inputs, and the one way to make a paid request.
// Messages written here are shown to the client, so they never name the data supplier.

export type Run = NonNullable<Awaited<ReturnType<typeof WorkflowRunService.load>>>
export type Step = Run['steps'][number]
type Log = { info: (message: string) => void; error: (message: string) => void }

export type EngineDeps = {
   client: Pick<DataClient, 'balanceMicros' | 'start' | 'check' | 'findJob' | 'cancel'>
   signal: AbortSignal
   log: Log
   // How "Send via API" posts; tests swap it for a fake.
   post?: Post
}

// Where an If keeps the people it did not pass on, for an Else after it.
export const ELSE_SUFFIX = '~else'

// The side output of an If or a "Run another workflow" block, read by an Else after it.
export const elseKey = (ctx: { at: ItemKey }, sourceId: string) => ({
   ...ctx.at,
   nodeId: `${sourceId}${ELSE_SUFFIX}`,
})

export const DAY_MS = 24 * 60 * 60 * 1000

export type StepResult = {
   status: 'DONE' | 'PARTIAL'
   itemsIn: number
   itemsOut: number
   message?: string
}

export type Context = {
   run: Run
   graph: Graph
   node: GraphNode
   step: Step
   // Where this step's output is kept.
   at: ItemKey
   inputs: WorkflowItemData[]
   preview: boolean
   deps: EngineDeps
}

// A step that cannot go on, with the sentence the client reads.
export class StepError extends Error {}

// The worker is stopping; the step is given back and resumes later.
export class Paused extends Error {}

// The step waits for another run or for its paid requests; it is given back and looked at again on a later tick.
export class Waiting extends Error {}

export const WALLET_LOW = 'Collecting stopped because the data wallet ran low. What was found so far is kept.'
export const SERVICE_BUSY = 'The data service did not answer for some requests. What was found so far is kept.'

export const peopleOf = (items: WorkflowItemData[]) =>
   items.filter((item): item is PersonItem => item.kind === 'profile')
export const postsOf = (items: WorkflowItemData[]) => items.filter((item): item is PostItem => item.kind === 'post')
export const companiesOf = (items: WorkflowItemData[]) =>
   items.filter((item): item is CompanyItem => item.kind === 'company')

export const parentsOf = (graph: Graph, id: string) => graph.edges.filter(edge => edge.to === id).map(edge => edge.from)

export const configOf = (node: GraphNode) => blockOf(node.type).config.parse(node.config)

export const numberIn = (config: Record<string, unknown>, key: string) => {
   const value = config[key]

   return typeof value === 'number' ? value : 0
}

export const textIn = (config: Record<string, unknown>, key: string) => {
   const value = config[key]

   return typeof value === 'string' ? value : ''
}

export const wordsIn = (config: Record<string, unknown>, key: string) => {
   const value = config[key]

   return Array.isArray(value) ? value.map(String) : []
}

// The Score block's own scores; a block saved before it had them uses the workflow's.
export const thresholdsOf = (run: Run, scoring: GraphNode | null) => {
   if (scoring && 'qualifyScore' in scoring.config) {
      const config = configOf(scoring)

      return {
         qualifyScore: numberIn(config, 'qualifyScore'),
         maybeScore: numberIn(config, 'maybeScore'),
         maybeEnabled: config.keepMaybe !== false,
      }
   }

   return {
      qualifyScore: run.qualifyScore,
      maybeScore: run.maybeScore,
      maybeEnabled: run.maybeEnabled,
   }
}

// The nearest "Score" block before a node: its ideal customer is the one people are scored against.
export const scoringNodeBefore = (graph: Graph, id: string) => {
   const queue = parentsOf(graph, id)
   const seen = new Set<string>()

   while (queue.length > 0) {
      const next = queue.shift() ?? ''
      const node = graph.nodes.find(candidate => candidate.id === next)

      if (node?.type === 'score.icp') {
         return node
      }

      if (!seen.has(next)) {
         seen.add(next)
         queue.push(...parentsOf(graph, next))
      }
   }

   return null
}

export const rulesOf = async (userId: string, node: GraphNode | null): Promise<ScoringRules> => {
   const icpId = node ? configOf(node).icpId : null
   const icp = typeof icpId === 'string' ? await IcpService.getForUser(userId, icpId) : null

   if (!icp) {
      throw new StepError('The ideal customer this workflow scores against was deleted.')
   }

   return {
      ...icp,
      seniorities: readSeniorities(icp.seniorities),
   }
}

// Stops paid work below the floor. Reads the wallet fresh, so the admin view stays current too.
const walletLow = async (client: EngineDeps['client']) => {
   const balance = await client.balanceMicros()

   await WalletService.save(balance)

   return balance < floorMicros()
}

// 'running': its job is in flight; 'later': waiting for a retry or for a free slot. 'stop' means no more paid requests,
// for example when the wallet ran low.
export type CallOutcome = 'done' | 'failed' | 'stop' | 'running' | 'later'

// Jobs one step keeps in flight at the data service at a time.
const MAX_IN_FLIGHT = 5

type PaidCall = {
   ctx: Context
   inputKey: string
   slug: string
   params: Record<string, unknown>
   // What to do with the rows of a finished request.
   use: (rows: Record<string, unknown>[]) => Promise<void>
}

// One paid request, recorded before it is sent and moved one step per tick (see `advanceJob`): started, looked at,
// retried when it failed without a charge. A finished request is skipped; a known job is looked at, never paid twice.
const paidCall = async ({
   ctx,
   inputKey,
   slug,
   params,
   use,
   mayStart,
}: PaidCall & { mayStart: boolean }): Promise<CallOutcome> => {
   const { run, step, deps } = ctx
   const call = await WorkflowRunService.call(step.id, inputKey)

   if (call.finishedAt) {
      return call.status === 'DONE' ? 'done' : 'failed'
   }

   if (deps.signal.aborted) {
      throw new Paused()
   }

   if (call.retryAt && call.retryAt > new Date()) {
      return 'later'
   }

   const fresh = !call.jobId && !call.sentAt

   if (fresh && !mayStart) {
      return 'later'
   }

   if (fresh && (await walletLow(deps.client))) {
      return 'stop'
   }

   const booking = {
      userId: run.userId,
      workflowId: run.workflowId,
      runId: run.id,
      stepId: step.id,
   }
   const fail = (error: string) =>
      WorkflowRunService.finishCall(
         call.id,
         {
            status: 'FAILED',
            rows: 0,
            costMicros: 0,
            error,
         },
         booking
      )
   const where = `workflow run=${run.id} step=${step.nodeId}`

   try {
      const next = await advanceJob(
         deps.client,
         {
            slug,
            params,
            ...call,
         },
         {
            sending: async () => {
               await WorkflowRunService.markSent(call.id)
            },
            started: async id => {
               await WorkflowRunService.saveJobId(call.id, id)
            },
         }
      )

      if (next.status === 'running') {
         return 'running'
      }

      if (next.status === 'retry') {
         deps.log.error(`${where} request failed, retry ${call.attempts + 1}: ${next.error}`)
         await WorkflowRunService.retryCall(call.id, next)

         return 'later'
      }

      if (next.status === 'failed') {
         deps.log.error(`${where} request failed after its retries: ${next.error}`)
         await fail(next.error.slice(0, 300))

         return 'failed'
      }

      const { outcome } = next

      await use(outcome.rows)
      await WorkflowRunService.finishCall(
         call.id,
         {
            status: outcome.status === 'completed' ? 'DONE' : 'FAILED',
            rows: outcome.rows.length,
            costMicros: outcome.costMicros,
            error: outcome.error,
         },
         booking
      )

      if (outcome.status === 'rejected_balance') {
         return 'stop'
      }

      return outcome.status === 'completed' ? 'done' : 'failed'
   } catch (error) {
      if (!(error instanceof DataServiceError) || error.kind === 'CONFIG') {
         throw error
      }

      deps.log.error(`${where} request failed: ${error.kind} ${error.message}`)
      await fail(error.kind)

      return error.kind === 'BALANCE' ? 'stop' : 'failed'
   }
}

export type Request = Omit<PaidCall, 'ctx'>

// Moves every request of the step one step, a few jobs in flight at a time, and gives the step back until all have
// ended. After a 'stop' nothing new is started; jobs already running still finish and are booked.
export const collectEach = async (ctx: Context, requests: Request[]): Promise<StepResult> => {
   let failed = 0
   let running = 0
   let later = 0
   let stopped = false

   for (const request of requests) {
      const outcome = await paidCall({
         ctx,
         ...request,
         mayStart: !stopped && running < MAX_IN_FLIGHT,
      })

      stopped ||= outcome === 'stop'
      failed += outcome === 'failed' ? 1 : 0
      running += outcome === 'running' ? 1 : 0
      later += outcome === 'later' ? 1 : 0
   }

   if (running > 0 || (later > 0 && !stopped)) {
      throw new Waiting()
   }

   return {
      status: stopped || failed > 0 ? 'PARTIAL' : 'DONE',
      itemsIn: ctx.inputs.length,
      itemsOut: await WorkflowRunService.countItems(ctx.at),
      message: stopped ? WALLET_LOW : failed > 0 ? SERVICE_BUSY : undefined,
   }
}

export const keepItems = async (ctx: Context, items: WorkflowItemData[], itemsIn: number): Promise<StepResult> => {
   await WorkflowRunService.replaceItems(ctx.at, items)

   return {
      status: 'DONE',
      itemsIn,
      itemsOut: items.length,
   }
}
