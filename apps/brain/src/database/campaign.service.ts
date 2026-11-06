import { CAMPAIGN_LIMITS, type CampaignStage, campaignInputSchema, campaignLabelOf } from '@automatedLinkedIn/contracts'

import { ConflictError, isUniqueViolation } from './conflict'
import { PrismaService } from './prisma.service'
import { WorkflowService } from './workflow.service'

// Campaigns group workflows and name the label their people carry (.plan/lead-pipeline-p5-campaign-page.md). Every call is scoped to the
// owner. Deleting a campaign keeps its workflows, people and labels.

const PAUSED = 'The campaign was paused.'

export class CampaignService {
   public static async list(userId: string) {
      const rows = await PrismaService.client.campaign.findMany({
         where: { userId },
         orderBy: { createdAt: 'desc' },
         select: {
            id: true,
            name: true,
            label: true,
            pausedAt: true,
            createdAt: true,
            _count: { select: { workflows: true } },
         },
      })

      return rows.map(({ _count, ...row }) => ({
         ...row,
         workflows: _count.workflows,
      }))
   }

   public static get(userId: string, id: string) {
      return PrismaService.client.campaign.findFirst({
         where: {
            id,
            userId,
         },
         select: {
            id: true,
            name: true,
            label: true,
            pausedAt: true,
            pausedWorkflowIds: true,
            createdAt: true,
         },
      })
   }

   public static async create(userId: string, input: { name: string }) {
      const { name } = campaignInputSchema.parse(input)
      const db = PrismaService.client

      if ((await db.campaign.count({ where: { userId } })) >= CAMPAIGN_LIMITS.perOwner) {
         throw new ConflictError(`You can keep up to ${CAMPAIGN_LIMITS.perOwner} campaigns. Delete one first.`)
      }

      try {
         return await db.campaign.create({
            data: {
               userId,
               name,
               label: campaignLabelOf(name),
            },
            select: {
               id: true,
               name: true,
               label: true,
            },
         })
      } catch (error) {
         if (isUniqueViolation(error)) {
            throw new ConflictError(`You already have a campaign named "${name}" or one that gives the same label.`)
         }

         throw error
      }
   }

   public static async remove(userId: string, id: string) {
      const { count } = await PrismaService.client.campaign.deleteMany({
         where: {
            id,
            userId,
         },
      })

      return count === 1
   }

   // Puts the owner's workflow in a campaign of the owner (or in none) at a stage. false when either is not the owner's.
   public static async place(userId: string, workflowId: string, campaignId: string | null, stage: CampaignStage) {
      const db = PrismaService.client

      if (campaignId && !(await this.get(userId, campaignId))) {
         return false
      }

      const { count } = await db.workflow.updateMany({
         where: {
            id: workflowId,
            userId,
         },
         data: {
            campaignId,
            stage,
         },
      })

      return count === 1
   }

   public static workflowsOf(userId: string, campaignId: string) {
      return PrismaService.client.workflow.findMany({
         where: {
            userId,
            campaignId,
         },
         orderBy: { createdAt: 'asc' },
         select: {
            id: true,
            name: true,
            stage: true,
            enabled: true,
         },
      })
   }

   // Switches the campaign's workflows off and keeps which ones they were. What is queued still goes, unless `stopQueued`: then the
   // queued acts, invites and waiting drafts of its workflows are cancelled, and they do not come back.
   public static async pause(userId: string, id: string, stopQueued: boolean, now = new Date()) {
      const campaign = await this.get(userId, id)

      if (!campaign) {
         return null
      }

      const workflows = await this.workflowsOf(userId, id)
      const on = workflows.filter(({ enabled }) => enabled)

      for (const { id: workflowId } of on) {
         await WorkflowService.update(userId, workflowId, { enabled: false })
      }

      await PrismaService.client.campaign.update({
         where: { id },
         data: {
            pausedAt: now,
            pausedWorkflowIds: [
               ...new Set([...campaign.pausedWorkflowIds, ...on.map(({ id: workflowId }) => workflowId)]),
            ],
         },
      })

      if (stopQueued) {
         const origin = {
            userId,
            originWorkflowId: { in: workflows.map(({ id: workflowId }) => workflowId) },
         }
         const db = PrismaService.client

         await db.postAct.updateMany({
            where: {
               ...origin,
               state: 'QUEUED',
            },
            data: {
               state: 'CANCELLED',
               reason: PAUSED,
            },
         })
         await db.linkedInInvite.updateMany({
            where: {
               ...origin,
               state: 'QUEUED',
            },
            data: {
               state: 'CANCELLED',
               reason: PAUSED,
            },
         })
         await db.draft.updateMany({
            where: {
               ...origin,
               state: 'DRAFTED',
            },
            data: {
               state: 'CANCELLED',
               reason: PAUSED,
            },
         })
         await db.linkedInReply.updateMany({
            where: {
               ...origin,
               state: 'QUEUED',
            },
            data: {
               state: 'FAILED',
               failure: PAUSED,
            },
         })
      }

      return { switchedOff: on.length }
   }

   // Switches back on the workflows Pause switched off. One that cannot be switched on now (a problem was added) stays off.
   public static async resume(userId: string, id: string) {
      const campaign = await this.get(userId, id)

      if (!campaign) {
         return null
      }

      let switchedOn = 0

      for (const workflowId of campaign.pausedWorkflowIds) {
         try {
            if (await WorkflowService.update(userId, workflowId, { enabled: true })) {
               switchedOn += 1
            }
         } catch (error) {
            if (!(error instanceof ConflictError)) {
               throw error
            }
         }
      }

      await PrismaService.client.campaign.update({
         where: { id },
         data: {
            pausedAt: null,
            pausedWorkflowIds: [],
         },
      })

      return { switchedOn }
   }
}
