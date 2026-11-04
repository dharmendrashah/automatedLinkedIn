import { ApprovalStartService } from 'database'

import { defineJob } from './defineJob'

// Starts "When I approve" with what the owner approved in the inbox (.plan/lead-pipeline-p4-ai-drafts.md). Idle passes write nothing.
export const approvalStart = defineJob({
   name: 'approval-start',
   title: 'Approved words',
   purpose:
      'Starts the workflow that goes on with the words you approved in your inbox, grouping approvals that come close together into one run.',
   everyMs: 60_000,
   startAfterMs: 40_000,
   timeoutMs: 2 * 60 * 1000,
   run: async () => {
      const { started, held, grouping } = await ApprovalStartService.startDue()

      if (started + held + grouping === 0) {
         return undefined
      }

      return {
         ...(started > 0 && { summary: `${started} runs started from approvals` }),
         counts: {
            started,
            held,
            grouping,
         },
      }
   },
})
