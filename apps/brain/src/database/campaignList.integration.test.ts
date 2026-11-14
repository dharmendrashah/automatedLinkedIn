import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { CampaignService } from './campaign.service'
import { CampaignListService } from './campaignList.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowService } from './workflow.service'

// Needs PostgreSQL.

const DAY_MS = 86_400_000
const NOW = new Date('2026-11-13T12:00:00.000Z')
const EMPTY = {
   nodes: [],
   edges: [],
}
const dayAt = (offset: number) => new Date(NOW.getTime() + offset * DAY_MS).toISOString().slice(0, 10)
// The 14 complete days the gate reads: 2 to 15 days before NOW.
const WINDOW = Array.from({ length: 14 }, (_, index) => dayAt(-15 + index))

const users: string[] = []

const makeUser = async () => {
   const user = await UserService.create({ email: `${randomUUID()}@elitale.com` })
   users.push(user.id)
   return user.id
}

const makeCampaign = async (userId: string) => {
   const campaign = await CampaignService.create(userId, { name: `List ${randomUUID()}` })
   await PrismaService.client.campaign.update({
      where: { id: campaign.id },
      data: { createdAt: new Date(NOW.getTime() - 30 * DAY_MS) },
   })
   return campaign
}

const placeWorkflow = async (userId: string, campaignId: string) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Invite ${randomUUID()}`,
      goal: null,
      graph: EMPTY,
   })
   await CampaignService.place(userId, workflow.id, campaignId, 'INVITE')
}

const row = (campaignId: string, day: string, counts: Record<string, number>) =>
   PrismaService.client.campaignDay.create({
      data: {
         campaignId,
         day,
         ...counts,
      },
   })

const listFor = (userId: string) => CampaignListService.list(userId, NOW)

afterAll(async () => {
   await PrismaService.client.user.deleteMany({ where: { id: { in: users } } })
   await PrismaService.disconnect()
})

describe('CampaignListService.list', () => {
   it('sums the 14-day window into the numbers and derives the accept rate', async () => {
      const userId = await makeUser()
      const campaign = await makeCampaign(userId)
      await placeWorkflow(userId, campaign.id)
      for (const day of WINDOW) {
         await row(campaign.id, day, {
            found: 3,
            qualified: 1,
            invited: 2,
            accepted: 1,
            replied: 1,
         })
      }

      const [listed] = await listFor(userId)

      expect(listed?.id).toBe(campaign.id)
      expect(listed?.state).toBe('RUNNING')
      expect(listed?.numbers).toEqual({
         qualified: 14,
         invited: 28,
         acceptRate: 0.5,
         replied: 14,
      })
   })

   it('returns null numbers for a campaign with workflows but no rows yet', async () => {
      const userId = await makeUser()
      const campaign = await makeCampaign(userId)
      await placeWorkflow(userId, campaign.id)

      const [listed] = await listFor(userId)

      expect(listed?.state).toBe('NOT_STARTED')
      expect(listed?.numbers).toBeNull()
      expect(listed?.projection).toEqual({
         status: 'hidden',
         reason: 'tooEarly',
      })
   })

   it('reports NO_WORKFLOWS with no numbers or projection when the campaign has no workflow', async () => {
      const userId = await makeUser()
      const campaign = await makeCampaign(userId)
      await row(campaign.id, dayAt(-3), {
         qualified: 5,
         invited: 5,
      })

      const [listed] = await listFor(userId)

      expect(listed?.state).toBe('NO_WORKFLOWS')
      expect(listed?.numbers).toBeNull()
      expect(listed?.projection).toBeNull()
   })

   it("never lists another owner's campaigns", async () => {
      const owner = await makeUser()
      const stranger = await makeUser()
      const ownerCampaign = await makeCampaign(owner)
      await placeWorkflow(owner, ownerCampaign.id)
      await row(ownerCampaign.id, dayAt(-3), {
         qualified: 5,
         invited: 5,
      })
      const strangerCampaign = await makeCampaign(stranger)

      const listed = await listFor(stranger)

      expect(listed.map(({ id }) => id)).toEqual([strangerCampaign.id])
   })
})
