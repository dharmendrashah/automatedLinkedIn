import { type WorkflowItemData, parseLinkedInUrl, person } from 'core'
import { backSources, forwardSources, sourceRound } from 'core/workflowInput'

import { type ItemKey, WorkflowRunService, WorkflowTriggerService, readGraph } from 'database'

import {
   type Graph,
   type GraphNode,
   type ItemKind,
   RUNS_LAST,
   SCORING_BLOCKS,
   TAKES_ANYTHING,
   applyApiInput,
   backEdges,
   blockOf,
   convertsTo,
   edgeKey,
   executionOrder,
   isFired,
   isHandled,
   isTrigger,
   loopRoundsOf,
   portOfEdge,
   repeatRegions,
   retriesOf,
} from '@automatedLinkedIn/contracts'

import {
   ELSE_SUFFIX,
   type EngineDeps,
   Paused,
   type Run,
   SERVICE_BUSY,
   type Step,
   WALLET_LOW,
   Waiting,
   configOf,
   unhandledFailure,
} from './context'
import { EXECUTORS } from './executors'
import { PLAIN_FAILURE, failureOf } from './failure'

// Runs workflow graphs step by step, keeping every step's output in the database so a stopped worker resumes where it
// was. A For each or a loop runs its blocks again in a new round. Messages written here are shown to the client, so
// they never name the data supplier.

export { type EngineDeps } from './context'

const PASSED = new Set(['DONE', 'PARTIAL', 'SKIPPED'])
const FINISHED = new Set(['DONE', 'PARTIAL', 'FAILED', 'SKIPPED'])
const SCORING_STEPS: ReadonlySet<string> = SCORING_BLOCKS
const RUN_LAST: ReadonlySet<string> = RUNS_LAST
const UNREADABLE = 'This run could not be read, so it was ended. Run the workflow again.'
const SKIPPED_AFTER_STOP = 'You stopped the run before this block started, so it did not run.'
const SKIPPED_AFTER_FAILURE = 'Another block failed before this block started, so it did not run.'
const ENDED_AFTER_FAILURE = 'Ended early because another block failed.'
// Blocks that take items of every kind as they are.
const RAW_INPUTS = TAKES_ANYTHING

const keyOf = (nodeId: string, round: number) => `${nodeId}#${round}`

const slugsOf = (items: WorkflowItemData[]) => new Set(items.map(({ slug }) => slug))

// What a step gets: the blocks before it in the same round, and over a loop's way back what the round before found
// that was new.
const readInputs = async (run: Run, graph: Graph, node: GraphNode, step: Step) => {
   const has = new Set(run.steps.map(({ nodeId, round }) => keyOf(nodeId, round)))
   const forward = forwardSources(graph, node, step.round, (nodeId, round) => has.has(keyOf(nodeId, round)))
   const items = await WorkflowRunService.items(run.id, forward)

   if (step.round === 0) {
      return items
   }

   for (const from of backSources(graph, node.id)) {
      const latest = await WorkflowRunService.items(run.id, [
         {
            nodeId: from,
            round: step.round - 1,
         },
      ])
      const earlier = slugsOf(
         await WorkflowRunService.items(
            run.id,
            Array.from({ length: step.round - 1 }, (_, earlierRound) => ({
               nodeId: from,
               round: earlierRound,
            }))
         )
      )

      items.push(...latest.filter(({ slug }) => !earlier.has(slug)))
   }

   return items
}

// Posts become their authors for a block that wants people; whatever a block cannot use passes through it.
const sortInputs = (items: WorkflowItemData[], needs: ItemKind | null) => {
   const inputs: WorkflowItemData[] = []
   const passThrough: WorkflowItemData[] = []

   if (needs === null) {
      return {
         inputs,
         passThrough,
      }
   }

   for (const item of items) {
      const author = item.kind === 'post' && item.author ? parseLinkedInUrl(item.author, 'profile') : null

      if (item.kind === needs) {
         inputs.push(item)
      } else if (author && convertsTo('post', needs)) {
         inputs.push(person(author))
      } else {
         passThrough.push(item)
      }
   }

   return {
      inputs,
      passThrough,
   }
}

// A block with a Retry right after it gets another try instead of ending (.plan/logic-wait-result-retry.md).
const retried = async (graph: Graph, node: GraphNode, step: Step, needsReopened: boolean): Promise<boolean> => {
   const retry = retriesOf(graph, node.id)

   if (retry === null) {
      return false
   }

   return WorkflowRunService.retryStep(step.id, {
      max: retry.times,
      waitSeconds: retry.waitSeconds,
      needsReopened,
   })
}

const runStep = async (run: Run, graph: Graph, step: Step, deps: EngineDeps): Promise<'waiting' | 'ended'> => {
   const node = graph.nodes.find(({ id }) => id === step.nodeId)

   if (!node) {
      await WorkflowRunService.finishStep(step.id, {
         status: 'FAILED',
         itemsIn: 0,
         itemsOut: 0,
         message: PLAIN_FAILURE,
         errorCode: 'UNEXPECTED',
      })

      return 'ended'
   }

   const at = {
      runId: run.id,
      nodeId: node.id,
      round: step.round,
   }

   let inputsRead: WorkflowItemData[] = []
   // The first take of a step is remembered, for the time limits of blocks that wait.
   const started = {
      ...step,
      startedAt: step.startedAt ?? new Date(),
   }

   try {
      if (!step.startedAt) {
         await WorkflowRunService.markStarted(step.id, started.startedAt)
      }

      const read = await readInputs(run, graph, node, step)

      inputsRead = read
      const { inputs, passThrough } = RAW_INPUTS.has(node.type)
         ? {
              inputs: read,
              passThrough: [],
           }
         : sortInputs(read, blockOf(node.type).input)
      const result = await EXECUTORS[node.type]({
         run,
         graph,
         // A call's values stand in for the settings they replace, for this run only.
         node: {
            ...node,
            config: applyApiInput(node.type, node.config, run.input),
         },
         step: started,
         at,
         inputs,
         preview: run.trigger === 'PREVIEW',
         deps,
      })

      // Some requests failed: a Retry after the block sends them again before anything after it sees the result.
      if (result.status === 'PARTIAL' && result.message === SERVICE_BUSY && (await retried(graph, node, step, true))) {
         return 'ended'
      }

      if (passThrough.length > 0) {
         await WorkflowRunService.seedItems(at, passThrough)
      }

      const { emit, ...finished } = result

      await WorkflowRunService.finishStep(step.id, {
         ...finished,
         itemsOut: result.itemsOut + passThrough.length,
         emits: await emitsOf(node, at, emit),
      })
   } catch (error) {
      if (error instanceof Paused || error instanceof Waiting) {
         await WorkflowRunService.release(step.id)

         return error instanceof Waiting ? 'waiting' : 'ended'
      }

      const failure = failureOf(error)

      deps.log.error(
         `workflow run=${run.id} step=${step.nodeId} failed: ${error instanceof Error ? error.message : 'unknown error'}`
      )

      if (await retried(graph, node, step, false)) {
         return 'ended'
      }

      // What reached the block is kept for the Task result or Retry that looks at it.
      if (isHandled(graph, node.id)) {
         await WorkflowRunService.replaceItems(
            {
               ...at,
               nodeId: `${node.id}~failed`,
            },
            inputsRead
         )
      }

      await WorkflowRunService.finishStep(step.id, {
         status: 'FAILED',
         itemsIn: 0,
         itemsOut: 0,
         ...failure,
         // A failure a Task result or Retry looks at lets what stands between them and the failed block run.
         emits: isHandled(graph, node.id) ? ['main'] : [],
      })
   }

   return 'ended'
}

// Which outputs of a step gave something: what the block says itself, else `main` when it gave items or passes on that it
// was live, and `else` when it kept items aside.
const emitsOf = async (node: GraphNode, at: ItemKey, emit: string[] | undefined) => {
   if (emit) {
      return emit
   }

   const { liveness } = blockOf(node.type)
   const main = liveness === 'passes' || liveness === 'always' || (await WorkflowRunService.countItems(at)) > 0
   const aside =
      (await WorkflowRunService.countItems({
         ...at,
         nodeId: `${node.id}${ELSE_SUFFIX}`,
      })) > 0

   return [...(main ? ['main'] : []), ...(aside ? ['else'] : [])]
}

const NOTHING_REACHED = 'Nothing reached this block, so it did not run.'
const NOT_FIRED = 'This trigger did not start the run, so it did not run.'

// Why a block that has not started does not run: its trigger did not fire, or no line into it is live (the block before it
// gave nothing on that output). A block with no line into it, and one that restarts a loop, runs.
const deadReason = (run: Run, graph: Graph, step: Step, byKey: Map<string, Step>, back: Set<string>) => {
   const node = graph.nodes.find(({ id }) => id === step.nodeId)

   if (!node) {
      return null
   }

   if (isTrigger(node.type)) {
      return isFired(graph, run.trigger, node.type) ? null : NOT_FIRED
   }

   const round = sourceRound(node.type, step.round)
   const reaching = graph.edges
      .filter(edge => edge.to === node.id && !back.has(edgeKey(edge)))
      .flatMap(edge => {
         const parent = byKey.get(keyOf(edge.from, round))

         return parent
            ? [
                 {
                    edge,
                    parent,
                 },
              ]
            : []
      })

   if (reaching.length === 0) {
      return null
   }

   return reaching.some(({ edge, parent }) => parent.emits.includes(portOfEdge(graph, edge))) ? null : NOTHING_REACHED
}

// The blocks to run again after `round`: For each blocks with batches left, and loops whose way back found something
// new, up to the workflow's number of rounds. None when the round stopped on a low wallet or the owner stopped the run.
const nextRound = async (run: Run, graph: Graph, round: number) => {
   const current = run.steps.filter(step => step.round === round)

   if (run.stopRequestedAt || current.some(({ message }) => message === WALLET_LOW)) {
      return []
   }

   const again = new Set<string>()

   for (const region of repeatRegions(graph)) {
      if (region.kind === 'forEach') {
         const node = graph.nodes.find(({ id }) => id === region.start)
         const step = current.find(({ nodeId }) => nodeId === region.start)
         const size = node ? Number(configOf(node).batchSize) : 0

         if (step && size > 0 && (round + 1) * size < step.itemsIn) {
            region.nodes.forEach(id => again.add(id))
         }
      } else if (region.backEdge && round + 1 < loopRoundsOf(graph)) {
         const { from } = region.backEdge
         const latest = await WorkflowRunService.items(run.id, [
            {
               nodeId: from,
               round,
            },
         ])
         const earlier = slugsOf(
            await WorkflowRunService.items(
               run.id,
               Array.from({ length: round }, (_, earlierRound) => ({
                  nodeId: from,
                  round: earlierRound,
               }))
            )
         )

         if (latest.some(({ slug }) => !earlier.has(slug))) {
            region.nodes.forEach(id => again.add(id))
         }
      }
   }

   return graph.nodes
      .filter(({ id }) => again.has(id))
      .map(({ id, type }) => ({
         nodeId: id,
         type,
      }))
}

// Everyone the run's "Add to list" blocks got, once.
const listedPeople = (run: Run) => WorkflowRunService.listedPeople(run.id)

// A failed step that a Task result or a Retry looks at does not end the run: the run goes on and ends with gaps.
const finish = async (run: Run, graph: Graph, deps: EngineDeps) => {
   // A stopped run winds down like any other: paid jobs finish and are kept, nothing new is paid for.
   const stopped = run.stopRequestedAt !== null
   const handled = run.steps.find(({ status, nodeId }) => status === 'FAILED' && isHandled(graph, nodeId))
   const failed = unhandledFailure(run, graph)
   const partial = handled !== undefined || run.steps.some(({ status }) => status === 'PARTIAL')
   const discarded = run.steps
      .filter(({ type }) => SCORING_STEPS.has(type))
      .reduce((sum, { itemsIn, itemsOut }) => sum + Math.max(0, itemsIn - itemsOut), 0)
   const people = await listedPeople(run)

   await WorkflowRunService.setBands(run.id, {
      qualified: people.filter(({ band }) => band === 'QUALIFIED').length,
      maybe: people.filter(({ band }) => band === 'MAYBE').length,
   })

   const { count } = await WorkflowRunService.finishRun(run.id, {
      status: stopped ? 'STOPPED' : failed ? 'FAILED' : partial ? 'PARTIAL' : 'SUCCEEDED',
      discarded,
      message: stopped ? undefined : (failed?.message ?? handled?.message ?? undefined),
   })

   // Only the worker that ended the run starts the workflows listening to it, and never after a preview, a failure or
   // a stop.
   if (count === 1 && !failed && !stopped && run.trigger !== 'PREVIEW') {
      const started = await WorkflowTriggerService.startAfter(run, people)

      if (started > 0) {
         deps.log.info(`workflow run=${run.id} started ${started} chained runs`)
      }
   }
}

// A run whose stored graph no longer parses cannot go on; it ends instead of failing on every tick.
const readableGraph = (run: Run) => {
   try {
      return readGraph(run.graph)
   } catch {
      return null
   }
}

const endUnreadable = async (run: Run, deps: EngineDeps) => {
   deps.log.error(`workflow run=${run.id} has a graph that cannot be read; ending it`)

   for (const step of run.steps.filter(({ status }) => !FINISHED.has(status))) {
      await WorkflowRunService.finishStep(step.id, {
         status: 'FAILED',
         itemsIn: 0,
         itemsOut: 0,
         message: UNREADABLE,
         errorCode: 'RUN_UNREADABLE',
      })
   }

   await WorkflowRunService.finishRun(run.id, {
      status: 'FAILED',
      discarded: 0,
      message: UNREADABLE,
   })
}

// Runs every step that is ready, until the run ends or nothing more can start. True when it did something.
export const advanceRun = async (runId: string, deps: EngineDeps) => {
   let progressed = false
   // Steps waiting for another run are looked at once per call, not in a loop.
   const waiting = new Set<string>()

   while (!deps.signal.aborted) {
      const run = await WorkflowRunService.load(runId)

      if (!run || run.status !== 'RUNNING') {
         return progressed
      }

      const graph = readableGraph(run)

      if (!graph) {
         await endUnreadable(run, deps)

         return true
      }
      const back = backEdges(graph)
      const byKey = new Map(run.steps.map(step => [keyOf(step.nodeId, step.round), step]))
      const nodeOf = new Map(graph.nodes.map(node => [node.id, node]))

      const failed = unhandledFailure(run, graph)
      const winding = failed !== undefined || run.stopRequestedAt !== null

      // After a Stop or a failure nothing new starts: steps never taken are skipped, and after a failure the steps that wait
      // on no paid request end. A step with a request still open goes on, so the request is booked, and the run ends when
      // none is open.
      if (winding) {
         const skipped = await WorkflowRunService.skipNotStarted(
            run.id,
            failed ? SKIPPED_AFTER_FAILURE : SKIPPED_AFTER_STOP
         )
         const ended = failed ? await WorkflowRunService.endStartedWithoutRequests(run.id, ENDED_AFTER_FAILURE) : 0

         if (skipped + ended > 0) {
            progressed = true
            continue
         }
      }

      if (run.steps.every(({ status }) => FINISHED.has(status))) {
         const round = Math.max(0, ...run.steps.map(step => step.round))
         const again = failed ? [] : await nextRound(run, graph, round)

         if (again.length > 0) {
            await WorkflowRunService.addRound(run.id, again, round + 1)
            progressed = true
            continue
         }

         await finish(run, graph, deps)

         return true
      }

      const ready = run.steps.filter(step => {
         const node = nodeOf.get(step.nodeId)
         const round = node ? sourceRound(node.type, step.round) : step.round
         const parentsPassed = graph.edges
            .filter(edge => edge.to === step.nodeId && !back.has(edgeKey(edge)))
            .every(({ from }) => {
               const parent = byKey.get(keyOf(from, round))

               return (
                  !parent ||
                  PASSED.has(parent.status) ||
                  (parent.status === 'FAILED' && isHandled(graph, parent.nodeId))
               )
            })

         return (
            (step.status === 'WAITING' || step.status === 'RUNNING') &&
            !waiting.has(step.id) &&
            // A Wait, or the pause before a retry, holds the step back; a stop or a failure lets it go at once.
            (!step.waitUntil || step.waitUntil <= new Date() || winding) &&
            parentsPassed &&
            // Posts are marked done only after everything else has finished.
            (!RUN_LAST.has(step.type) || run.steps.every(other => other.id === step.id || FINISHED.has(other.status)))
         )
      })
      const order = new Map(executionOrder(graph).map((id, index) => [id, index]))

      // One branch to its end before the next, the one at the top first.
      ready.sort((a, b) => a.round - b.round || (order.get(a.nodeId) ?? 0) - (order.get(b.nodeId) ?? 0))

      // A block nothing reaches ends without running (runs of the old rules run every block).
      if (run.engineVersion >= 2) {
         let skipped = 0

         for (const step of ready.filter(({ startedAt }) => startedAt === null)) {
            const reason = deadReason(run, graph, step, byKey, back)

            if (reason && (await WorkflowRunService.skipStep(step.id, reason))) {
               skipped += 1
            }
         }

         if (skipped > 0) {
            progressed = true

            continue
         }
      }

      let claimed = false

      for (const step of ready) {
         if (deps.signal.aborted || !(await WorkflowRunService.claim(step.id))) {
            continue
         }

         claimed = true

         const outcome = await runStep(
            run,
            graph,
            {
               ...step,
               claimedAt: new Date(),
            },
            deps
         )

         // A step that only looked at its waiting jobs is not progress, so a quiet tick stays quiet.
         if (outcome === 'waiting') {
            waiting.add(step.id)
         } else {
            progressed = true
         }

         break
      }

      if (!claimed) {
         return progressed
      }
   }

   return progressed
}
