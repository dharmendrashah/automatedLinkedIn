import { CAMPAIGN_LIMITS, type CampaignStage, campaignInputSchema, campaignLabelOf } from '@automatedLinkedIn/contracts'

import { ConflictError, isUniqueViolation } from './conflict'
import { PrismaService } from './prisma.service'
import { WorkflowService, readGraph } from './workflow.service'

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

   // Switches on what finds and connects (the Discover and Invite workflows) and, only when asked, arms their Send invite blocks.
   // The other stages and every limit are untouched. A failure part way switches back off what this call switched on. Safe to call
   // again (.plan/007-start-finding-and-connecting-in-one-action.md).
   public static async start(userId: string, id: string, options: { sendInvites: boolean }) {
      const campaign = await this.get(userId, id)

      if (!campaign) {
         return null
      }

      if (campaign.pausedAt) {
         throw new ConflictError('This campaign is paused. Resume it first.')
      }

      const workflows = await this.workflowsOf(userId, id)
      const discover = workflows.find(({ stage }) => stage === 'DISCOVER')
      const invite = workflows.find(({ stage }) => stage === 'INVITE')

      if (!invite) {
         throw new ConflictError('This campaign has nothing to start.')
      }

      const turnedOn: string[] = []
      let armed = 0

      try {
         for (const workflow of [discover, invite]) {
            if (workflow && !workflow.enabled) {
               await WorkflowService.update(userId, workflow.id, { enabled: true })
               turnedOn.push(workflow.id)
            }
         }

         if (options.sendInvites) {
            armed = await this.armInvites(userId, invite.id)
         }
      } catch (error) {
         for (const workflowId of turnedOn) {
            await WorkflowService.update(userId, workflowId, { enabled: false }).catch(() => undefined)
         }

         throw error
      }

      return {
         switchedOn: turnedOn.length,
         armed,
      }
   }

   // Sets "Act for real" on every Send invite block of the workflow, saved only if nobody saved it since it was read. Returns how many
   // blocks are armed afterwards.
   private static async armInvites(userId: string, workflowId: string) {
      const current = await WorkflowService.get(userId, workflowId)

      if (!current) {
         return 0
      }

      const graph = readGraph(current.graph)
      const sends = graph.nodes.filter(({ type }) => type === 'account.sendInvite')
      const toArm = sends.filter(({ config }) => config.actForReal !== true)

      if (toArm.length > 0) {
         await WorkflowService.update(
            userId,
            workflowId,
            {
               graph: {
                  ...graph,
                  nodes: graph.nodes.map(node =>
                     toArm.includes(node)
                        ? {
                             ...node,
                             config: {
                                ...node.config,
                                actForReal: true,
                             },
                          }
                        : node
                  ),
               },
            },
            { expectedUpdatedAt: current.updatedAt }
         )
      }

      return sends.length
   }
}
