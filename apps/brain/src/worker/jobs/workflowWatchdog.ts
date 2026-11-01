import { WorkflowRunService } from 'database'

import { defineJob } from './defineJob'

// Ends a run that made no progress for a day and a half and waits for nothing, so it does not hold the workflow's one
// live run slot for ever (.plan/workflow-engine-p4-lifecycle.md). A tick that ended nothing writes no log line.
export const workflowWatchdog = defineJob({
   name: 'workflow-watchdog',
   title: 'Stuck workflow runs',
   purpose: 'Ends a workflow run that has made no progress for a day and a half and waits for nothing.',
   everyMs: 30 * 60 * 1000,
   startAfterMs: 3 * 60 * 1000,
   timeoutMs: 5 * 60 * 1000,
   run: async () => {
      const ended = await WorkflowRunService.endStuck()

      return ended.length > 0
         ? {
              summary: `${ended.length} stuck runs ended`,
              counts: { ended: ended.length },
           }
         : undefined
   },
})
