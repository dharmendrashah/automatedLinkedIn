import {
   AUTOMATIONS,
   type AutomationAnswers,
   type AutomationId,
   automationAnswersSchema,
   automationProblems,
   buildAutomation,
} from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { IcpService } from './icp.service'
import { WorkflowService } from './workflow.service'

// The automations (.plan/lead-pipeline-p10-automations.md): one form makes the workflows of one automation, all switched off with "Act for
// real" off. A failure part way removes what was made, so a retry starts clean.

export class AutomationService {
   public static async create(userId: string, id: AutomationId, input: AutomationAnswers) {
      const answers = automationAnswersSchema.parse(input)
      const info = AUTOMATIONS.find(each => each.id === id)

      if (!info) {
         throw new ConflictError('That automation does not exist.')
      }

      if (info.waitsFor) {
         throw new ConflictError(`${info.title} is not available yet. It waits for: ${info.waitsFor}`)
      }

      const problems = automationProblems(id, input)

      if (problems.length > 0) {
         throw new ConflictError(problems.join(' '))
      }

      if (!(await IcpService.getForUser(userId, answers.icpId))) {
         throw new ConflictError('That ideal customer was not found.')
      }

      const made: string[] = []

      try {
         const workflows: Array<{ id: string; name: string }> = []

         for (const { name, graph } of buildAutomation(id, input)) {
            const workflow = await WorkflowService.create(userId, {
               name,
               goal: null,
               graph,
            })

            made.push(workflow.id)
            workflows.push({
               id: workflow.id,
               name,
            })
         }

         return { workflows }
      } catch (error) {
         for (const workflowId of made) {
            await WorkflowService.delete(userId, workflowId).catch(() => undefined)
         }

         throw error
      }
   }
}
