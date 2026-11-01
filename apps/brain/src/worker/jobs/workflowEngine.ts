import { MINDCASE_API_KEY } from 'env'

import { WalletService, WorkflowRunService } from 'database'

import { dataClient as client } from '../data/client'
import { advanceRun } from '../engine/engine'
import { defineJob } from './defineJob'

// Moves every running workflow forward (.plan/gtm-phase-2-engine-canvas.md). A quiet tick writes no log line.
export const workflowEngine = defineJob({
   name: 'workflow-engine',
   title: 'Workflow engine',
   purpose: 'Moves every running workflow forward one step at a time.',
   everyMs: 5_000,
   startAfterMs: 10_000,
   timeoutMs: 20 * 60 * 1000,
   run: async ({ signal }) => {
      // A queued run starts when the live run of its workflow ended.
      let moved = await WorkflowRunService.promoteWaiting()

      for (const runId of await WorkflowRunService.activeRunIds()) {
         if (
            await advanceRun(runId, {
               client,
               signal,
               log: console,
            })
         ) {
            moved += 1
         }
      }

      return moved > 0
         ? {
              summary: `${moved} runs moved forward`,
              counts: { moved },
           }
         : undefined
   },
})

// Keeps the wallet balance fresh for the admin view and the floor check of new runs.
export const dataWallet = defineJob({
   name: 'data-wallet',
   title: 'Data wallet balance',
   purpose:
      'Keeps the balance of the shared data wallet fresh, for the admin view and the check before a workflow starts.',
   everyMs: 10 * 60 * 1000,
   startAfterMs: 20_000,
   timeoutMs: 60_000,
   run: async () => {
      if (!MINDCASE_API_KEY) {
         return undefined
      }

      await WalletService.save(await client.balanceMicros())

      return undefined
   },
})
