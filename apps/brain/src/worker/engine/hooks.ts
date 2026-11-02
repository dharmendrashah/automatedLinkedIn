import { forwardSources } from 'core/workflowInput'

import { HookService } from 'database'

import { type Graph, type GraphNode, type HookPort, STOP_MESSAGE } from '@automatedLinkedIn/contracts'

import { type EngineDeps, type Run, type Step } from './context'

// Where the engine tells a block's hooks that a moment came (.plan/workflow-events-and-hooks.md). A hook only watches: nothing here
// may stop, delay or fail the block, so every error is logged and dropped.

// What a hook is about: before and on, what reached the block; after, what it gave, or what reached it when it failed.
const keysOf = (run: Run, graph: Graph, node: GraphNode, step: Step, phase: HookPort, failed: boolean) => {
   if (phase === 'after' && !failed) {
      return [
         {
            nodeId: node.id,
            round: step.round,
         },
      ]
   }

   const has = new Set(run.steps.map(({ nodeId, round }) => `${nodeId}#${round}`))

   return forwardSources(graph, node, step.round, (nodeId, round) => has.has(`${nodeId}#${round}`))
}

export const fireHook = async (
   run: Run,
   graph: Graph,
   node: GraphNode,
   step: Step,
   phase: HookPort,
   deps: EngineDeps,
   failed = false
) => {
   if (run.hooks === null) {
      return
   }

   try {
      await HookService.fire({
         run,
         nodeId: node.id,
         phase,
         round: step.round,
         tries: step.tries,
         keys: keysOf(run, graph, node, step, phase, failed),
      })
   } catch (error) {
      deps.log.error(
         `workflow run=${run.id} hook ${phase} of ${node.id} failed: ${error instanceof Error ? error.message : 'unknown error'}`
      )
   }
}

// When a run ends: a main run fires the hooks that fire once after their block; a hook run that ended on a Stop block stops its host.
export const closeHooks = async (run: Run, failed: Step | undefined, deps: EngineDeps) => {
   try {
      if (run.kind === 'HOOK') {
         if (failed?.errorCode === 'STOPPED_BY_BLOCK' && run.parentRunId) {
            await HookService.stopHost(run.parentRunId, failed.message ?? STOP_MESSAGE)
         }
      } else if (run.hooks !== null) {
         await HookService.fireOnceAfter(run, run.steps)
      }
   } catch (error) {
      deps.log.error(
         `workflow run=${run.id} hooks could not close: ${error instanceof Error ? error.message : 'unknown error'}`
      )
   }
}
