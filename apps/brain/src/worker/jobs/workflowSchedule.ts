import { ConflictError, WorkflowService, readGraph } from 'database'

import { nextScheduledRun, scheduleOf } from '@automatedLinkedIn/contracts'

import { defineJob } from './defineJob'

// Starts the scheduled workflows whose time has come. The run key is the planned time, so two replicas or a repeated
// tick start it once. A start that is refused (a run still going, no posts, the wallet low) is skipped, not retried.
export const workflowSchedule = defineJob({
   name: 'workflow-schedule',
   everyMs: 60_000,
   startAfterMs: 30_000,
   timeoutMs: 5 * 60 * 1000,
   run: async () => {
      const now = new Date()
      let started = 0
      let skipped = 0

      for (const workflow of await WorkflowService.due(now)) {
         const schedule = scheduleOf(readGraph(workflow.graph))
         const plannedAt = workflow.nextRunAt ?? now

         try {
            const run = await WorkflowService.startRun(
               workflow.userId,
               workflow.id,
               'SCHEDULE',
               `${workflow.id}:${plannedAt.toISOString()}`
            )

            started += run ? 1 : 0
         } catch (error) {
            if (!(error instanceof ConflictError)) {
               throw error
            }

            skipped += 1
         } finally {
            await WorkflowService.setNextRun(workflow.id, schedule ? nextScheduledRun(schedule, now) : null)
         }
      }

      return started > 0 || skipped > 0 ? { summary: `${started} started, ${skipped} skipped` } : undefined
   },
})
