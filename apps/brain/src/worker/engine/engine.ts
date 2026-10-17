import { type WorkflowItemData, parseLinkedInUrl, person } from 'core'
import { DataServiceError } from 'core/dataClient'

import { WorkflowRunService, WorkflowTriggerService, readGraph } from 'database'

import {
   type Graph,
   type GraphNode,
   type ItemKind,
   backEdges,
   blockOf,
   convertsTo,
   edgeKey,
   loopRoundsOf,
   repeatRegions,
} from '@automatedLinkedIn/contracts'

import { type EngineDeps, Paused, type Run, type Step, StepError, WALLET_LOW, WaitingOnRun, configOf } from './context'
import { EXECUTORS } from './executors'

// Runs workflow graphs step by step, keeping every step's output in the database so a stopped worker resumes where it
// was. A For each or a loop runs its blocks again in a new round. Messages written here are shown to the client, so
// they never name the data supplier.

export { type EngineDeps } from './context'

const PASSED = new Set(['DONE', 'PARTIAL'])
const FINISHED = new Set(['DONE', 'PARTIAL', 'FAILED'])
const SCORING_STEPS = new Set(['score.icp', 'collect.profile'])
// Blocks that take items of every kind as they are.
const RAW_INPUTS = new Set(['process.merge', 'logic.runWorkflow'])

const PLAIN_FAILURE = 'Something went wrong in this step. The platform owner has been told.'
const NOT_CONFIGURED = 'Collecting data is not available right now. The platform owner has been told.'

const keyOf = (nodeId: string, round: number) => `${nodeId}#${round}`

// A For each always reads what reached it in the first round; it hands out one batch per round.
const sourceRound = (node: GraphNode, round: number) => (node.type === 'logic.forEach' ? 0 : round)

const slugsOf = (items: WorkflowItemData[]) => new Set(items.map(({ slug }) => slug))

// What a step gets: the blocks before it in the same round, and over a loop's way back what the round before found
// that was new.
const readInputs = async (run: Run, graph: Graph, node: GraphNode, step: Step) => {
   const back = backEdges(graph)
   const has = new Set(run.steps.map(({ nodeId, round }) => keyOf(nodeId, round)))
   const into = graph.edges.filter(({ to }) => to === node.id)
   const round = sourceRound(node, step.round)
   const forward = into
      .filter(edge => !back.has(edgeKey(edge)) && has.has(keyOf(edge.from, round)))
      .map(({ from }) => ({
         nodeId: from,
         round,
      }))
   const items = await WorkflowRunService.items(run.id, forward)

   if (step.round === 0) {
      return items
   }

   for (const { from } of into.filter(edge => back.has(edgeKey(edge)))) {
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

const runStep = async (run: Run, graph: Graph, step: Step, deps: EngineDeps): Promise<'waiting' | 'ended'> => {
   const node = graph.nodes.find(({ id }) => id === step.nodeId)

   if (!node) {
      await WorkflowRunService.finishStep(step.id, {
         status: 'FAILED',
         itemsIn: 0,
         itemsOut: 0,
         message: PLAIN_FAILURE,
      })

      return 'ended'
   }

   const at = {
      runId: run.id,
      nodeId: node.id,
      round: step.round,
   }

   try {
      const read = await readInputs(run, graph, node, step)
      const { inputs, passThrough } = RAW_INPUTS.has(node.type)
         ? {
              inputs: read,
              passThrough: [],
           }
         : sortInputs(read, blockOf(node.type).input)
      const result = await EXECUTORS[node.type]({
         run,
         graph,
         node,
         step,
         at,
         inputs,
         preview: run.trigger === 'PREVIEW',
         deps,
      })

      if (passThrough.length > 0) {
         await WorkflowRunService.seedItems(at, passThrough)
      }

      await WorkflowRunService.finishStep(step.id, {
         ...result,
         itemsOut: result.itemsOut + passThrough.length,
      })
   } catch (error) {
      if (error instanceof Paused || error instanceof WaitingOnRun) {
         await WorkflowRunService.release(step.id)

         return error instanceof WaitingOnRun ? 'waiting' : 'ended'
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

   return 'ended'
}

// The blocks to run again after `round`: For each blocks with batches left, and loops whose way back found something
// new, up to the workflow's number of rounds. None when the round stopped on a low wallet.
const nextRound = async (run: Run, graph: Graph, round: number) => {
   const current = run.steps.filter(step => step.round === round)

   if (current.some(({ message }) => message === WALLET_LOW)) {
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

const finish = async (run: Run, deps: EngineDeps) => {
   const failed = run.steps.find(({ status }) => status === 'FAILED')
   const partial = run.steps.some(({ status }) => status === 'PARTIAL')
   const discarded = run.steps
      .filter(({ type }) => SCORING_STEPS.has(type))
      .reduce((sum, { itemsIn, itemsOut }) => sum + Math.max(0, itemsIn - itemsOut), 0)
   const people = await listedPeople(run)

   await WorkflowRunService.setBands(run.id, {
      qualified: people.filter(({ band }) => band === 'QUALIFIED').length,
      maybe: people.filter(({ band }) => band === 'MAYBE').length,
   })

   const { count } = await WorkflowRunService.finishRun(run.id, {
      status: failed ? 'FAILED' : partial ? 'PARTIAL' : 'SUCCEEDED',
      discarded,
      message: failed?.message ?? undefined,
   })

   // Only the worker that ended the run starts the workflows listening to it, and never after a preview or a failure.
   if (count === 1 && !failed && run.trigger !== 'PREVIEW') {
      const started = await WorkflowTriggerService.startAfter(run, people)

      if (started > 0) {
         deps.log.info(`workflow run=${run.id} started ${started} chained runs`)
      }
   }
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

      const graph = readGraph(run.graph)
      const back = backEdges(graph)
      const byKey = new Map(run.steps.map(step => [keyOf(step.nodeId, step.round), step]))
      const nodeOf = new Map(graph.nodes.map(node => [node.id, node]))

      if (run.steps.some(({ status }) => status === 'FAILED')) {
         await finish(run, deps)

         return true
      }

      if (run.steps.every(({ status }) => FINISHED.has(status))) {
         const round = Math.max(0, ...run.steps.map(step => step.round))
         const again = await nextRound(run, graph, round)

         if (again.length > 0) {
            await WorkflowRunService.addRound(run.id, again, round + 1)
            progressed = true
            continue
         }

         await finish(run, deps)

         return true
      }

      const ready = run.steps.filter(step => {
         const node = nodeOf.get(step.nodeId)
         const round = node ? sourceRound(node, step.round) : step.round
         const parentsPassed = graph.edges
            .filter(edge => edge.to === step.nodeId && !back.has(edgeKey(edge)))
            .every(({ from }) => {
               const parent = byKey.get(keyOf(from, round))

               return !parent || PASSED.has(parent.status)
            })

         return (
            (step.status === 'WAITING' || step.status === 'RUNNING') &&
            !waiting.has(step.id) &&
            parentsPassed &&
            // Posts are marked done only after everything else has finished.
            (step.type !== 'output.markPosts' ||
               run.steps.every(other => other.id === step.id || FINISHED.has(other.status)))
         )
      })
      let claimed = false

      for (const step of ready) {
         if (deps.signal.aborted || !(await WorkflowRunService.claim(step.id))) {
            continue
         }

         claimed = true
         progressed = true

         const outcome = await runStep(
            run,
            graph,
            {
               ...step,
               claimedAt: new Date(),
            },
            deps
         )

         if (outcome === 'waiting') {
            waiting.add(step.id)
         }

         break
      }

      if (!claimed) {
         return progressed
      }
   }

   return progressed
}
