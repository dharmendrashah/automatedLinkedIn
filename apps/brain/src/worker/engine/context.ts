import { type CompanyItem, type PersonItem, type PostItem, type WorkflowItemData, readSeniorities } from 'core'

import { IcpService, type ItemKey, WalletService, WorkflowRunService, floorMicros } from 'database'

import { type Graph, type GraphNode, blockOf } from '@automatedLinkedIn/contracts'

import { type DataClient, DataServiceError } from '../data/dataClient'
import { type Post } from './sendApi'
import { type ScoringRules } from './steps'

// What every step executor shares: the run it belongs to, its inputs, and the one way to make a paid request.
// Messages written here are shown to the client, so they never name the data supplier.

export type Run = NonNullable<Awaited<ReturnType<typeof WorkflowRunService.load>>>
export type Step = Run['steps'][number]
type Log = { info: (message: string) => void; error: (message: string) => void }

export type EngineDeps = {
   client: Pick<DataClient, 'balanceMicros' | 'collect' | 'findJob'>
   signal: AbortSignal
   log: Log
   // How "Send via API" posts; tests swap it for a fake.
   post?: Post
}

// Where an If keeps the people it did not pass on, for an Else after it.
export const ELSE_SUFFIX = '~else'

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

export const thresholdsOf = (run: Run) => ({
   qualifyScore: run.qualifyScore,
   maybeScore: run.maybeScore,
   maybeEnabled: run.maybeEnabled,
})

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

export type CallOutcome = 'done' | 'failed' | 'stop'

type PaidCall = {
   ctx: Context
   inputKey: string
   slug: string
   params: Record<string, unknown>
   // What to do with the rows of a finished request.
   use: (rows: Record<string, unknown>[]) => Promise<void>
}

// One paid request, recorded before it is sent. A request already finished is skipped; one whose job id is known is
// read again instead of paid twice. 'stop' means collecting must end, for example when the wallet ran low.
export const paidCall = async ({ ctx, inputKey, slug, params, use }: PaidCall): Promise<CallOutcome> => {
   const { run, step, deps } = ctx
   const call = await WorkflowRunService.call(step.id, inputKey)

   if (call.finishedAt) {
      return call.status === 'DONE' ? 'done' : 'failed'
   }

   if (deps.signal.aborted) {
      throw new Paused()
   }

   if (await walletLow(deps.client)) {
      return 'stop'
   }

   const booking = {
      userId: run.userId,
      workflowId: run.workflowId,
      runId: run.id,
      stepId: step.id,
   }

   try {
      // A request sent before a crash may have started a job whose id was never saved.
      const jobId =
         call.jobId ??
         (call.createdAt < (step.claimedAt ?? new Date()) ? await deps.client.findJob(slug, call.createdAt) : null)
      const outcome = await deps.client.collect(slug, params, {
         jobId,
         onJobId: async id => {
            await WorkflowRunService.saveJobId(call.id, id)
         },
      })

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

      deps.log.error(`workflow run=${run.id} step=${step.nodeId} request failed: ${error.kind} ${error.message}`)
      await WorkflowRunService.finishCall(
         call.id,
         {
            status: 'FAILED',
            rows: 0,
            costMicros: 0,
            error: error.kind,
         },
         booking
      )

      return error.kind === 'BALANCE' ? 'stop' : 'failed'
   }
}

export type Request = Omit<PaidCall, 'ctx'>

// Sends one request per input, in order, and stops at the first 'stop'. The step's output is what `use` saved.
export const collectEach = async (ctx: Context, requests: Request[]): Promise<StepResult> => {
   let failed = 0
   let stopped = false

   for (const request of requests) {
      const outcome = await paidCall({
         ctx,
         ...request,
      })

      if (outcome === 'stop') {
         stopped = true
         break
      }

      failed += outcome === 'failed' ? 1 : 0
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
