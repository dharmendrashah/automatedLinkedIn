import {
   type PersonItem,
   type PostItem,
   type WorkflowItemData,
   expandShortPostLink,
   isShortPostLink,
   mergeBySlug,
   readSeniorities,
} from 'core'

import {
   IcpService,
   LinkedInPostService,
   WalletService,
   WorkflowListService,
   WorkflowRunService,
   floorMicros,
   readGraph,
} from 'database'

import { type Graph, type GraphNode, blockOf } from '@automatedLinkedIn/contracts'

import { type DataClient, DataServiceError } from '../data/dataClient'
import {
   ENRICH_BATCH,
   commentersFrom,
   commentersParams,
   profilesFrom,
   profilesParams,
   reactorsFrom,
   reactorsParams,
} from '../data/operations'
import { type FilterConfig, type ScoringRules, applyProfiles, filterPeople, scorePeople } from './steps'

// Runs workflow graphs step by step, keeping every step's output in the database so a stopped worker resumes where it
// was. Messages written here are shown to the client, so they never name the data supplier.

type Run = NonNullable<Awaited<ReturnType<typeof WorkflowRunService.load>>>
type Step = Run['steps'][number]
type Log = { info: (message: string) => void; error: (message: string) => void }

export type EngineDeps = {
   client: Pick<DataClient, 'balanceMicros' | 'collect' | 'findJob'>
   signal: AbortSignal
   log: Log
}

type StepResult = {
   status: 'DONE' | 'PARTIAL'
   itemsIn: number
   itemsOut: number
   message?: string
}

type Context = {
   run: Run
   graph: Graph
   node: GraphNode
   step: Step
   inputs: WorkflowItemData[]
   preview: boolean
   deps: EngineDeps
}

// A step that cannot go on, with the sentence the client reads.
class StepError extends Error {}

// The worker is stopping; the step is given back and resumes later.
class Paused extends Error {}

const PASSED = new Set(['DONE', 'PARTIAL'])
const FINISHED = new Set(['DONE', 'PARTIAL', 'FAILED'])
const SCORING_STEPS = new Set(['score.icp', 'collect.profile'])

const WALLET_LOW = 'Collecting stopped because the data wallet ran low. The people found so far are kept.'
const SERVICE_BUSY = 'The data service did not answer for some posts. The people found so far are kept.'

const peopleOf = (items: WorkflowItemData[]) => items.filter((item): item is PersonItem => item.kind === 'profile')
const postsOf = (items: WorkflowItemData[]) => items.filter((item): item is PostItem => item.kind === 'post')

const parentsOf = (graph: Graph, id: string) => graph.edges.filter(edge => edge.to === id).map(edge => edge.from)

const configOf = (node: GraphNode) => blockOf(node.type).config.parse(node.config)

const numberIn = (config: Record<string, unknown>, key: string) => {
   const value = config[key]

   return typeof value === 'number' ? value : 0
}

const thresholdsOf = (run: Run) => ({
   qualifyScore: run.qualifyScore,
   maybeScore: run.maybeScore,
   maybeEnabled: run.maybeEnabled,
})

// The nearest "Score" block before a node: its ideal customer is the one people are scored against.
const scoringNodeBefore = (graph: Graph, id: string) => {
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

const rulesOf = async (userId: string, node: GraphNode | null): Promise<ScoringRules> => {
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
const paidCall = async ({ ctx, inputKey, slug, params, use }: PaidCall): Promise<'done' | 'failed' | 'stop'> => {
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

const collectEngagement = async (ctx: Context, kind: 'commenters' | 'reactors'): Promise<StepResult> => {
   const posts = postsOf(ctx.inputs)
   const howMany = numberIn(configOf(ctx.node), 'howMany')
   let failed = 0
   let stopped = false

   for (const post of posts) {
      const outcome = await paidCall({
         ctx,
         inputKey: post.slug,
         slug: kind === 'commenters' ? 'post-comments' : 'post-reactions',
         params: kind === 'commenters' ? commentersParams(post, howMany) : reactorsParams(post, howMany),
         use: async rows => {
            const people = kind === 'commenters' ? commentersFrom(rows, post) : reactorsFrom(rows, post)

            await WorkflowRunService.mergePeople(ctx.run.id, ctx.node.id, people)
         },
      })

      if (outcome === 'stop') {
         stopped = true
         break
      }

      failed += outcome === 'failed' ? 1 : 0
   }

   const itemsOut = await WorkflowRunService.countItems(ctx.run.id, ctx.node.id)
   const partial = stopped || failed > 0

   return {
      status: partial ? 'PARTIAL' : 'DONE',
      itemsIn: posts.length,
      itemsOut,
      message: stopped ? WALLET_LOW : failed > 0 ? SERVICE_BUSY : undefined,
   }
}

const enrich = async (ctx: Context): Promise<StepResult> => {
   const { run, node, graph } = ctx
   const people = mergeBySlug(peopleOf(ctx.inputs))
   const rules = await rulesOf(run.userId, scoringNodeBefore(graph, node.id))
   const thresholds = thresholdsOf(run)
   const qualified = people.filter(({ band }) => band === 'QUALIFIED').sort((a, b) => a.slug.localeCompare(b.slug))
   let stopped = false

   await WorkflowRunService.seedItems(run.id, node.id, people)

   for (let start = 0; start < qualified.length && !stopped; start += ENRICH_BATCH) {
      const batch = qualified.slice(start, start + ENRICH_BATCH)
      const outcome = await paidCall({
         ctx,
         inputKey: `batch-${start / ENRICH_BATCH}`,
         slug: 'profiles',
         params: profilesParams(batch),
         use: async rows => {
            const rescored = applyProfiles(batch, profilesFrom(rows), rules, thresholds)
            const keptSlugs = new Set(rescored.kept.map(({ slug }) => slug))
            const dropped = batch
               .filter(({ slug }) => !keptSlugs.has(slug))
               .map(item => ({
                  ...item,
                  band: null,
               }))

            await WorkflowRunService.putItems(run.id, node.id, [...rescored.kept, ...dropped])
         },
      })

      stopped = outcome === 'stop'
   }

   const stored = peopleOf(await WorkflowRunService.items(run.id, [node.id]))
   const kept = stored.filter(({ band }) => band !== null)

   await WorkflowRunService.replaceItems(run.id, node.id, kept)

   return {
      status: stopped ? 'PARTIAL' : 'DONE',
      itemsIn: people.length,
      itemsOut: kept.length,
      message: stopped ? WALLET_LOW : undefined,
   }
}

const keepPeople = async (ctx: Context, people: PersonItem[], itemsIn: number): Promise<StepResult> => {
   await WorkflowRunService.replaceItems(ctx.run.id, ctx.node.id, people)

   return {
      status: 'DONE',
      itemsIn,
      itemsOut: people.length,
   }
}

const SEEN_CHUNK = 1_000

const notSeen = async (userId: string, people: PersonItem[]) => {
   const seen = new Set<string>()

   for (let start = 0; start < people.length; start += SEEN_CHUNK) {
      const chunk = people.slice(start, start + SEEN_CHUNK).map(({ slug }) => slug)

      for (const slug of await WorkflowListService.seenAmong(userId, chunk)) {
         seen.add(slug)
      }
   }

   return people.filter(({ slug }) => !seen.has(slug))
}

const addToList = async (ctx: Context): Promise<StepResult> => {
   const people = mergeBySlug(peopleOf(ctx.inputs)).filter(({ band }) => band !== null)
   const bands = {
      qualified: people.filter(({ band }) => band === 'QUALIFIED').length,
      maybe: people.filter(({ band }) => band === 'MAYBE').length,
   }

   await WorkflowRunService.setBands(ctx.run.id, bands)

   if (ctx.preview) {
      return {
         status: 'DONE',
         itemsIn: people.length,
         itemsOut: 0,
         message: 'A preview adds nobody to the list.',
      }
   }

   const added = await WorkflowListService.addFromRun(
      ctx.run.userId,
      ctx.run.workflow.outputListId,
      ctx.run.id,
      people.map(item => ({
         slug: item.slug,
         url: item.url,
         name: item.name,
         headline: item.headline,
         location: item.location,
         state: item.band === 'MAYBE' ? 'MAYBE' : 'QUALIFIED',
         postUrl: item.signals[0]?.via ?? null,
         score: item.score,
         signals: item.signals,
      }))
   )

   return {
      status: 'DONE',
      itemsIn: people.length,
      itemsOut: added,
   }
}

const markPosts = async (ctx: Context): Promise<StepResult> => {
   const posts = postsOf(ctx.inputs)

   if (ctx.preview) {
      return {
         status: 'DONE',
         itemsIn: posts.length,
         itemsOut: 0,
         message: 'A preview leaves your posts as they are.',
      }
   }

   const incomplete = ctx.run.steps.some(step => step.id !== ctx.step.id && step.status !== 'DONE')

   if (incomplete) {
      return {
         status: 'DONE',
         itemsIn: posts.length,
         itemsOut: 0,
         message: 'The posts stay not done because the run did not finish fully.',
      }
   }

   const marked = await LinkedInPostService.markProcessed(
      ctx.run.userId,
      posts.map(({ postId }) => postId)
   )

   return {
      status: 'DONE',
      itemsIn: posts.length,
      itemsOut: marked,
   }
}

// The data service cannot read lnkd.in short links: send the post they lead to. A short link not expanded when it was
// saved is expanded now and kept; if that fails too, the short link is sent and that post finds nobody.
const sendableUrl = async (post: { id: string; url: string; expandedUrl: string | null }) => {
   if (post.expandedUrl || !isShortPostLink(post.url)) {
      return post.expandedUrl ?? post.url
   }

   const expanded = await expandShortPostLink(post.url)

   if (expanded) {
      await LinkedInPostService.saveExpanded(post.id, expanded)
   }

   return expanded ?? post.url
}

const EXECUTORS: Record<GraphNode['type'], (ctx: Context) => Promise<StepResult>> = {
   'trigger.manual': async () => ({
      status: 'DONE',
      itemsIn: 0,
      itemsOut: 0,
   }),
   'trigger.schedule': async () => ({
      status: 'DONE',
      itemsIn: 0,
      itemsOut: 0,
   }),
   'input.posts': async ctx => {
      const posts = await LinkedInPostService.waiting(ctx.run.userId, numberIn(configOf(ctx.node), 'howMany'))
      const items: PostItem[] = await Promise.all(
         posts.map(async post => ({
            kind: 'post' as const,
            slug: post.slug,
            url: await sendableUrl(post),
            postId: post.id,
         }))
      )

      await WorkflowRunService.replaceItems(ctx.run.id, ctx.node.id, items)

      return {
         status: 'DONE',
         itemsIn: 0,
         itemsOut: items.length,
         message: items.length === 0 ? 'No posts were waiting in your posts list.' : undefined,
      }
   },
   'collect.commenters': ctx => collectEngagement(ctx, 'commenters'),
   'collect.reactors': ctx => collectEngagement(ctx, 'reactors'),
   'process.dedupe': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))

      return keepPeople(ctx, await notSeen(ctx.run.userId, people), people.length)
   },
   'process.filter': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))
      const config = configOf(ctx.node)
      const filter: FilterConfig = {
         minFollowers: numberIn(config, 'minFollowers'),
         signal: config.signal === 'commented' ? 'commented' : 'any',
         headlineWords: Array.isArray(config.headlineWords) ? config.headlineWords.map(String) : [],
      }

      return keepPeople(ctx, filterPeople(people, filter), people.length)
   },
   'score.icp': async ctx => {
      const people = mergeBySlug(peopleOf(ctx.inputs))
      const rules = await rulesOf(ctx.run.userId, ctx.node)
      const { kept } = scorePeople(people, rules, thresholdsOf(ctx.run))

      return keepPeople(ctx, kept, people.length)
   },
   'collect.profile': enrich,
   'output.list': addToList,
   'output.markPosts': markPosts,
}

const PLAIN_FAILURE = 'Something went wrong in this step. The platform owner has been told.'
const NOT_CONFIGURED = 'Collecting data is not available right now. The platform owner has been told.'

const runStep = async (run: Run, graph: Graph, step: Step, deps: EngineDeps) => {
   const node = graph.nodes.find(({ id }) => id === step.nodeId)

   if (!node) {
      await WorkflowRunService.finishStep(step.id, {
         status: 'FAILED',
         itemsIn: 0,
         itemsOut: 0,
         message: PLAIN_FAILURE,
      })

      return
   }

   try {
      const inputs = await WorkflowRunService.items(run.id, parentsOf(graph, node.id))
      const result = await EXECUTORS[node.type]({
         run,
         graph,
         node,
         step,
         inputs,
         preview: run.trigger === 'PREVIEW',
         deps,
      })

      await WorkflowRunService.finishStep(step.id, result)
   } catch (error) {
      if (error instanceof Paused) {
         await WorkflowRunService.release(step.id)

         return
      }

      const notConfigured = error instanceof DataServiceError && error.kind === 'CONFIG'

      deps.log.error(
         `workflow run=${run.id} step=${step.nodeId} failed: ${error instanceof Error ? error.message : 'unknown error'}`
      )
      await WorkflowRunService.finishStep(step.id, {
         status: 'FAILED',
         itemsIn: 0,
         itemsOut: 0,
         message: error instanceof StepError ? error.message : notConfigured ? NOT_CONFIGURED : PLAIN_FAILURE,
      })
   }
}

const finish = async (run: Run) => {
   const failed = run.steps.find(({ status }) => status === 'FAILED')
   const partial = run.steps.some(({ status }) => status === 'PARTIAL')
   const discarded = run.steps
      .filter(({ type }) => SCORING_STEPS.has(type))
      .reduce((sum, { itemsIn, itemsOut }) => sum + Math.max(0, itemsIn - itemsOut), 0)

   await WorkflowRunService.finishRun(run.id, {
      status: failed ? 'FAILED' : partial ? 'PARTIAL' : 'SUCCEEDED',
      discarded,
      message: failed?.message ?? undefined,
   })
}

// Runs every step that is ready, until the run ends or nothing more can start. True when it did something.
export const advanceRun = async (runId: string, deps: EngineDeps) => {
   let progressed = false

   while (!deps.signal.aborted) {
      const run = await WorkflowRunService.load(runId)

      if (!run || run.status !== 'RUNNING') {
         return progressed
      }

      const graph = readGraph(run.graph)
      const byNode = new Map(run.steps.map(step => [step.nodeId, step]))

      if (
         run.steps.some(({ status }) => status === 'FAILED') ||
         run.steps.every(({ status }) => FINISHED.has(status))
      ) {
         await finish(run)

         return true
      }

      const ready = run.steps.filter(
         step =>
            (step.status === 'WAITING' || step.status === 'RUNNING') &&
            parentsOf(graph, step.nodeId).every(parent => PASSED.has(byNode.get(parent)?.status ?? '')) &&
            // Posts are marked done only after everything else has finished.
            (step.type !== 'output.markPosts' ||
               run.steps.every(other => other.id === step.id || FINISHED.has(other.status)))
      )
      let claimed = false

      for (const step of ready) {
         if (deps.signal.aborted || !(await WorkflowRunService.claim(step.id))) {
            continue
         }

         claimed = true
         progressed = true
         await runStep(
            run,
            graph,
            {
               ...step,
               claimedAt: new Date(),
            },
            deps
         )
         break
      }

      if (!claimed) {
         return progressed
      }
   }

   return progressed
}
