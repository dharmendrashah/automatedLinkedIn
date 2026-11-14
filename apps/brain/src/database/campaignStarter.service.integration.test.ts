import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type OutreachAnswers } from '@automatedLinkedIn/contracts'

import { CampaignStarterService } from './campaignStarter.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowService, readGraph } from './workflow.service'

// Needs PostgreSQL. The Starter makes the ideal customer, the campaign and six workflows that are off, and nothing when it fails.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`

const answers: OutreachAnswers = {
   name: 'Outbound for agencies',
   phrases: ['onboarding too slow'],
   customer: {
      includeTitles: ['Founder'],
      seniorities: ['owner', 'nonsense'],
      locations: ['United States'],
   },
   message: 'Hi {first_name}, thanks for connecting.',
   note: 'Hi {first_name}, I liked your post.',
   warmUp: {
      reactions: true,
      comments: 'texts',
      texts: ['Great point, {author_first_name}.'],
   },
}

let userId: string

describe('the Starter (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should make the ideal customer, the campaign and six workflows that are off, one for each stage', async () => {
      const made = await CampaignStarterService.createOutreach(userId, answers)
      const campaign = await db.campaign.findUniqueOrThrow({ where: { id: made.campaignId } })
      const workflows = await db.workflow.findMany({
         where: { campaignId: made.campaignId },
         orderBy: { createdAt: 'asc' },
      })
      const icp = await db.icp.findUniqueOrThrow({ where: { id: campaign.icpId ?? '' } })

      expect(campaign).toMatchObject({
         name: 'Outbound for agencies',
         label: 'lead-outbound-for-agencies',
      })
      expect(workflows.map(({ stage, enabled }) => [stage, enabled])).toEqual([
         ['DISCOVER', false],
         ['INVITE', false],
         ['WARM_UP', false],
         ['FIRST_MESSAGE', false],
         ['HAND_OFF', false],
         ['NO_ANSWER', false],
      ])
      expect(icp).toMatchObject({
         includeTitles: ['founder'],
         seniorities: ['OWNER'],
         problemKeywords: ['onboarding too slow'],
      })
   })

   it('should let every stage be switched on, so no graph has an error', async () => {
      const campaign = await db.campaign.findFirstOrThrow({ where: { userId } })
      const workflows = await db.workflow.findMany({ where: { campaignId: campaign.id } })

      for (const { id } of workflows) {
         await expect(WorkflowService.update(userId, id, { enabled: true })).resolves.toBeTruthy()
      }
   })

   it('should refuse a name that is taken, and make nothing the second time', async () => {
      const before = await db.workflow.count({ where: { userId } })

      await expect(CampaignStarterService.createOutreach(userId, answers)).rejects.toThrow('already have a campaign')

      expect(await db.workflow.count({ where: { userId } })).toBe(before)
      expect(await db.icp.count({ where: { userId } })).toBe(1)
   })

   it('should make nothing, and keep a saved ideal customer, when the one picked is not the owner\u2019s', async () => {
      const before = await db.campaign.count({ where: { userId } })

      await expect(
         CampaignStarterService.createOutreach(userId, {
            ...answers,
            name: 'Another',
            customer: { icpId: randomUUID() },
         })
      ).rejects.toThrow('ideal customer was not found')

      expect(await db.campaign.count({ where: { userId } })).toBe(before)
   })

   it('should remove what it made when a step fails part way', async () => {
      const before = {
         campaigns: await db.campaign.count({ where: { userId } }),
         icps: await db.icp.count({ where: { userId } }),
      }

      // A workflow of the owner already has the name of the third one, so the third cannot be made.
      await WorkflowService.create(userId, {
         name: 'Broken \u00b7 3 Warm up',
         goal: null,
         graph: {
            nodes: [],
            edges: [],
         },
      })

      const workflows = await db.workflow.count({ where: { userId } })

      await expect(
         CampaignStarterService.createOutreach(userId, {
            ...answers,
            name: 'Broken',
         })
      ).rejects.toBeTruthy()

      expect(await db.workflow.count({ where: { userId } })).toBe(workflows)
      expect(await db.campaign.count({ where: { userId } })).toBe(before.campaigns)
      expect(await db.icp.count({ where: { userId } })).toBe(before.icps)
   })

   it('should make Discover first and start Invite when Discover finishes, not on a clock', async () => {
      const made = await CampaignStarterService.createOutreach(userId, {
         ...answers,
         name: 'Chained',
      })
      const [discover, invite] = made.workflows
      const inviteGraph = readGraph((await db.workflow.findUniqueOrThrow({ where: { id: invite?.id ?? '' } })).graph)

      expect(discover?.stage).toBe('DISCOVER')
      expect(invite?.stage).toBe('INVITE')
      expect(inviteGraph.nodes.filter(({ type }) => type.startsWith('trigger.'))).toEqual([
         expect.objectContaining({
            type: 'trigger.workflow',
            config: { workflowId: discover?.id },
         }),
      ])
   })

   it('should remove every workflow, the campaign and the ideal customer when the fifth one cannot be made', async () => {
      const before = {
         workflows: await db.workflow.count({ where: { userId } }),
         campaigns: await db.campaign.count({ where: { userId } }),
         icps: await db.icp.count({ where: { userId } }),
      }
      const create = WorkflowService.create.bind(WorkflowService)
      let calls = 0
      const spy = vi.spyOn(WorkflowService, 'create').mockImplementation((...args) => {
         calls += 1

         if (calls === 5) {
            return Promise.reject(new Error('injected'))
         }

         return create(...args)
      })

      try {
         await expect(
            CampaignStarterService.createOutreach(userId, {
               ...answers,
               name: 'Rolled back',
            })
         ).rejects.toThrow('injected')
      } finally {
         spy.mockRestore()
      }

      expect(await db.workflow.count({ where: { userId } })).toBe(before.workflows)
      expect(await db.campaign.count({ where: { userId } })).toBe(before.campaigns)
      expect(await db.icp.count({ where: { userId } })).toBe(before.icps)
   })
   it('should keep what one positive reply is worth a month on the campaign it makes, and leave it empty when none is given', async () => {
      const worth = await CampaignStarterService.createOutreach(userId, {
         ...answers,
         name: 'Worth of a reply',
         replyValueUsd: 100,
      })
      const unset = await CampaignStarterService.createOutreach(userId, {
         ...answers,
         name: 'No worth given',
      })

      const worthRow = await db.campaign.findUniqueOrThrow({ where: { id: worth.campaignId } })
      const unsetRow = await db.campaign.findUniqueOrThrow({ where: { id: unset.campaignId } })

      expect(worthRow.replyValueUsd).toBe(100)
      expect(unsetRow.replyValueUsd).toBeNull()
   })
})
