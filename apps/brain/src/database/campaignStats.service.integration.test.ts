import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CampaignService } from './campaign.service'
import { CampaignStatsService } from './campaignStats.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowService } from './workflow.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const EMPTY = {
   nodes: [],
   edges: [],
}
const day = (n: number) => new Date(Date.UTC(2026, 10, n))

let userId: string
let otherUserId: string
let campaignId: string
let discoverId: string
let inviteId: string

const runOf = (
   workflowId: string,
   trigger: 'MANUAL' | 'PREVIEW' | 'SCHEDULE' | 'WORKFLOW',
   status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'RUNNING',
   startedAt: Date
) =>
   PrismaService.client.workflowRun.create({
      data: {
         workflowId,
         userId,
         trigger,
         runKey: `run-${randomUUID()}`,
         status,
         graph: EMPTY,
         qualifyScore: 60,
         maybeScore: 40,
         maybeEnabled: true,
         qualified: 2,
         maybe: 1,
         startedAt,
         finishedAt: status === 'RUNNING' ? null : startedAt,
      },
   })

describe('the campaign page: last Discover run (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id

      const campaign = await CampaignService.create(userId, { name: 'Stats' })

      campaignId = campaign.id

      const discover = await WorkflowService.create(userId, {
         name: 'Stats \u00b7 1 Discover',
         goal: null,
         graph: EMPTY,
      })
      const invite = await WorkflowService.create(userId, {
         name: 'Stats \u00b7 2 Invite',
         goal: null,
         graph: EMPTY,
      })

      discoverId = discover.id
      inviteId = invite.id
      await CampaignService.place(userId, discoverId, campaignId, 'DISCOVER')
      await CampaignService.place(userId, inviteId, campaignId, 'INVITE')
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should return nothing for a campaign that is not the owner\u2019s', async () => {
      await expect(CampaignStatsService.lastDiscoverRun(otherUserId, campaignId)).resolves.toBeNull()
   })

   it('should return the newest real Discover run, never a preview or another stage', async () => {
      await runOf(discoverId, 'MANUAL', 'SUCCEEDED', day(1))
      await runOf(discoverId, 'PREVIEW', 'SUCCEEDED', day(3))
      await runOf(inviteId, 'WORKFLOW', 'SUCCEEDED', day(4))

      await expect(CampaignStatsService.lastDiscoverRun(userId, campaignId)).resolves.toMatchObject({
         status: 'SUCCEEDED',
         startedAt: day(1),
      })
   })

   it('should return a PARTIAL or FAILED run, and a live run with no finish time', async () => {
      await runOf(discoverId, 'SCHEDULE', 'PARTIAL', day(2))

      await expect(CampaignStatsService.lastDiscoverRun(userId, campaignId)).resolves.toMatchObject({
         status: 'PARTIAL',
         qualified: 2,
         maybe: 1,
      })

      await runOf(discoverId, 'SCHEDULE', 'FAILED', day(3))

      expect((await CampaignStatsService.lastDiscoverRun(userId, campaignId))?.status).toBe('FAILED')

      await runOf(discoverId, 'SCHEDULE', 'RUNNING', day(5))

      await expect(CampaignStatsService.lastDiscoverRun(userId, campaignId)).resolves.toMatchObject({
         status: 'RUNNING',
         finishedAt: null,
      })
   })
})
