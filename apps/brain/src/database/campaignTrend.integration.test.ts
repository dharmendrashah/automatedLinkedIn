import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { CampaignService } from './campaign.service'
import { CampaignTrendService } from './campaignTrend.service'
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

const makeCampaign = async (userId: string, createdAt = new Date(NOW.getTime() - 30 * DAY_MS)) => {
   const campaign = await CampaignService.create(userId, { name: `Trend ${randomUUID()}` })
   await PrismaService.client.campaign.update({
      where: { id: campaign.id },
      data: { createdAt },
   })
   return campaign
}

const row = (campaignId: string, day: string, counts: Record<string, number> = {}) =>
   PrismaService.client.campaignDay.create({
      data: {
         campaignId,
         day,
         ...counts,
      },
   })

const accountFor = (userId: string, extra: Record<string, unknown> = {}) =>
   PrismaService.client.linkedInAccount.create({
      data: {
         userId,
         email: `${randomUUID()}@example.com`,
         secret: 'x',
         secretIv: 'x',
         secretTag: 'x',
         status: 'ACTIVE',
         ...extra,
      },
   })

const insights = (userId: string, campaignId: string, period: '7d' | '30d' = '7d') =>
   CampaignTrendService.insights(userId, campaignId, period, NOW)

afterAll(async () => {
   await PrismaService.client.user.deleteMany({ where: { id: { in: users } } })
   await PrismaService.disconnect()
})

describe('CampaignTrendService.insights', () => {
   it('returns null for a campaign the user does not own', async () => {
      const owner = await makeUser()
      const campaign = await makeCampaign(owner)

      expect(await insights(await makeUser(), campaign.id)).toBeNull()
   })

   it('is empty with no people, invites or non-zero rows, and since follows the first row day', async () => {
      const userId = await makeUser()
      const campaign = await makeCampaign(userId)
      await row(campaign.id, dayAt(-1))

      const result = await insights(userId, campaign.id)

      expect(result?.state).toBe('empty')
      expect(result?.since).toBe(dayAt(-1))
      expect(result?.capacity.missing).toEqual(expect.arrayContaining(['noAccounts', 'noWorkflow', 'noDiscoverRun']))
   })

   it('is not empty when invites exist without any found person', async () => {
      const userId = await makeUser()
      const campaign = await makeCampaign(userId)
      const account = await accountFor(userId)
      const workflow = await WorkflowService.create(userId, {
         name: `Invite ${randomUUID()}`,
         goal: null,
         graph: EMPTY,
      })
      await CampaignService.place(userId, workflow.id, campaign.id, 'INVITE')
      await PrismaService.client.linkedInInvite.create({
         data: {
            userId,
            accountId: account.id,
            slug: randomUUID(),
            name: 'Invitee',
            state: 'SENT',
            plannedAt: NOW,
            invitedAt: NOW,
            originWorkflowId: workflow.id,
         },
      })

      const result = await insights(userId, campaign.id)

      expect(result?.state).toBe('tooEarly')
   })

   it('reports a missing complete day in the window as a gap and keeps the gate closed', async () => {
      const userId = await makeUser()
      const campaign = await makeCampaign(userId)
      for (const day of WINDOW.filter(day => day !== dayAt(-8))) {
         await row(campaign.id, day, {
            found: 1,
            invited: 2,
         })
      }

      const result = await insights(userId, campaign.id)

      expect(result?.state).toBe('tooEarly')
      expect(result?.gate.missingDays).toBe(1)
      expect(result?.gate.completeDays).toBe(13)
   })

   it('opens the trend when the 14-day window is complete and has 20 or more invites', async () => {
      const userId = await makeUser()
      const campaign = await makeCampaign(userId)
      for (const day of WINDOW) {
         await row(campaign.id, day, {
            found: 3,
            qualified: 1,
            invited: 2,
            messaged: 5,
            replied: 3,
            handedOver: 4,
         })
      }

      const result = await insights(userId, campaign.id)

      expect(result?.state).toBe('trend')
      expect(result?.gate).toMatchObject({
         completeDays: 14,
         missingDays: 0,
         invites: 28,
      })
      expect(result?.since).toBe(WINDOW[0])
      expect(result?.totals).not.toHaveProperty('messaged')
      expect(result?.totals).not.toHaveProperty('replied')
      expect(result?.totals).not.toHaveProperty('handedOver')
      expect(result?.totals.invited).toBe(10)
   })

   it('counts the qualified, maybe and not-yet-handled people of the campaign label', async () => {
      const userId = await makeUser()
      const campaign = await makeCampaign(userId)
      const { label } = await PrismaService.client.campaign.findUniqueOrThrow({
         where: { id: campaign.id },
         select: { label: true },
      })
      const person = (slug: string, extra: Record<string, unknown>) =>
         PrismaService.client.person.create({
            data: {
               userId,
               slug,
               name: slug,
               labels: [label],
               lastTouchAt: NOW,
               ...extra,
            },
         })
      await person('strong-1', {
         fit: 'STRONG',
         status: 'DONE',
      })
      await person('strong-2', {
         fit: 'STRONG',
         status: 'DONE',
      })
      await person('maybe-1', {
         fit: 'MAYBE',
         status: 'DONE',
      })
      await person('new-1', {
         fit: 'NONE',
         status: 'NEW',
      })
      await person('other-label', {
         fit: 'STRONG',
         status: 'NEW',
         labels: ['some-other-label'],
      })

      const result = await insights(userId, campaign.id)

      expect(result?.state).toBe('tooEarly')
      expect(result?.lists).toEqual({
         qualified: 2,
         maybe: 1,
         notYetHandled: 1,
      })
   })

   it('starts since at the first row day when that is later than the campaign creation day', async () => {
      const userId = await makeUser()
      const campaign = await makeCampaign(userId)
      await row(campaign.id, WINDOW[0], { found: 1 })

      const result = await insights(userId, campaign.id)

      expect(result?.since).toBe(WINDOW[0])
   })

   it('shows the usable capacity of a signed-in account and clears the noAccounts flag', async () => {
      const userId = await makeUser()
      const campaign = await makeCampaign(userId)
      await accountFor(userId)

      const result = await insights(userId, campaign.id)

      expect(result?.capacity.usableAccounts).toBe(1)
      expect(result?.capacity.missing).not.toContain('noAccounts')
   })
})
