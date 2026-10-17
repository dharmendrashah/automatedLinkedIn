import { type PersonItem } from 'core'

import { WorkflowRunService, WorkflowTriggerService, readGraph } from 'database'

import { type Graph } from '@automatedLinkedIn/contracts'

import { DataServiceError } from '../data/dataClient'
import { type EngineDeps, Paused, type Run, type Step, StepError, parentsOf } from './context'
import { EXECUTORS } from './executors'

// Runs workflow graphs step by step, keeping every step's output in the database so a stopped worker resumes where it
// was. Messages written here are shown to the client, so they never name the data supplier.

export { type EngineDeps } from './context'

const PASSED = new Set(['DONE', 'PARTIAL'])
const FINISHED = new Set(['DONE', 'PARTIAL', 'FAILED'])
const SCORING_STEPS = new Set(['score.icp', 'collect.profile'])

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

// The people a run kept: what reached its "Add to list" blocks with a band.
const keptPeople = async (run: Run, graph: Graph) => {
   const lists = graph.nodes.filter(({ type }) => type === 'output.list').map(({ id }) => id)
   const items = await WorkflowRunService.items(
      run.id,
      lists.flatMap(id => parentsOf(graph, id))
   )

   return items.filter((item): item is PersonItem => item.kind === 'profile' && item.band !== null)
}

const finish = async (run: Run, graph: Graph, deps: EngineDeps) => {
   const failed = run.steps.find(({ status }) => status === 'FAILED')
   const partial = run.steps.some(({ status }) => status === 'PARTIAL')
   const discarded = run.steps
      .filter(({ type }) => SCORING_STEPS.has(type))
      .reduce((sum, { itemsIn, itemsOut }) => sum + Math.max(0, itemsIn - itemsOut), 0)
   const { count } = await WorkflowRunService.finishRun(run.id, {
      status: failed ? 'FAILED' : partial ? 'PARTIAL' : 'SUCCEEDED',
      discarded,
      message: failed?.message ?? undefined,
   })

   // Only the worker that ended the run starts the workflows listening to it, and never after a preview or a failure.
   if (count === 1 && !failed && run.trigger !== 'PREVIEW') {
      const started = await WorkflowTriggerService.startAfter(run, await keptPeople(run, graph))

      if (started > 0) {
         deps.log.info(`workflow run=${run.id} started ${started} chained runs`)
      }
   }
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
         await finish(run, graph, deps)

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
