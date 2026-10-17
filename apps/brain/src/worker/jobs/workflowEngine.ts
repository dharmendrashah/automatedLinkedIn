import { MINDCASE_API_KEY, MINDCASE_RPM } from 'env'

import { WalletService, WorkflowRunService } from 'database'

import { DataClient } from '../data/dataClient'
import { advanceRun } from '../engine/engine'
import { defineJob } from './defineJob'

// One client for the process, so its pacing covers every request the worker sends.
const client = new DataClient({
   key: MINDCASE_API_KEY,
   requestsPerMinute: MINDCASE_RPM,
})

// Moves every running workflow forward (.plan/gtm-phase-2-engine-canvas.md). A quiet tick writes no log line.
export const workflowEngine = defineJob({
   name: 'workflow-engine',
   everyMs: 5_000,
   startAfterMs: 10_000,
   timeoutMs: 20 * 60 * 1000,
   run: async ({ signal }) => {
      let moved = 0

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

      return moved > 0 ? { summary: `${moved} runs moved forward` } : undefined
   },
})

// Keeps the wallet balance fresh for the admin view and the floor check of new runs.
export const dataWallet = defineJob({
   name: 'data-wallet',
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
