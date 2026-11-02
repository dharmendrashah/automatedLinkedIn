import { eventTriggerOf, graphSchema, upgradeGraph } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'

// The trigger blocks of switched-on workflows that listen to task events, one row each, kept in step with the graph so an event finds its
// listeners with one indexed query and no graph is read (.plan/workflow-events-and-hooks.md).
export class WorkflowListenerService {
   // Makes the rows of one workflow match its graph; none when it is switched off or deleted.
   public static async sync(workflowId: string) {
      const workflow = await PrismaService.client.workflow.findUnique({
         where: { id: workflowId },
         select: {
            id: true,
            userId: true,
            enabled: true,
            graph: true,
         },
      })

      const wanted = workflow?.enabled
         ? upgradeGraph(graphSchema.parse(workflow.graph)).nodes.flatMap(node => {
              const trigger = eventTriggerOf(node)

              return trigger
                 ? [
                      {
                         workflowId,
                         nodeId: node.id,
                         userId: workflow.userId,
                         phase: trigger.phase,
                         task: trigger.task,
                      },
                   ]
                 : []
           })
         : []

      await PrismaService.client.$transaction([
         PrismaService.client.workflowListener.deleteMany({ where: { workflowId } }),
         PrismaService.client.workflowListener.createMany({ data: wanted }),
      ])

      return wanted.length
   }

   // The trigger blocks of the owner's switched-on workflows that may want an event: this phase, this task or any.
   public static listening(userId: string, phase: string, task: string) {
      return PrismaService.client.workflowListener.findMany({
         where: {
            userId,
            phase,
            task: { in: [task, ''] },
            workflow: { enabled: true },
         },
         select: {
            workflowId: true,
            nodeId: true,
         },
      })
   }

   // Rebuilds every workflow's rows from the graphs, the safety net for a write that missed `sync`. Returns how many workflows differed.
   public static async repair() {
      const workflows = await PrismaService.client.workflow.findMany({ select: { id: true } })
      let changed = 0

      for (const { id } of workflows) {
         const before = await PrismaService.client.workflowListener.count({ where: { workflowId: id } })

         if ((await this.sync(id)) !== before) {
            changed += 1
         }
      }

      return changed
   }
}
