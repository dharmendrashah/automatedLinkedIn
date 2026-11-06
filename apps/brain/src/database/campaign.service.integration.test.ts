import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Graph } from '@automatedLinkedIn/contracts'

import { CampaignService } from './campaign.service'
import { CampaignRollupService } from './campaignRollup.service'
import { CampaignStatsService } from './campaignStats.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowService } from './workflow.service'

// Needs PostgreSQL. Two campaigns of one owner and one of another: the funnel, the cuts, pause and resume, and the rollup.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const graph: Graph = {
   nodes: [
      {
         id: 'call',
         type: 'trigger.api',
         config: {},
         position: {
            x: 0,
            y: 0,
         },
      },
      {
         id: 'list',
         type: 'output.list',
         config: {},
         position: {
            x: 240,
            y: 0,
         },
      },
   ],
   edges: [
      {
         from: 'call',
         to: 'list',
      },
   ],
}

let userId: string
let otherUserId: string
let accountId: string
let first: { id: string; label: string }
let second: { id: string; label: string }
let workflowA: string
let workflowB: string

const person = (slug: string, extra: Record<string, unknown> = {}, owner = userId) =>
   db.person.create({
      data: {
         userId: owner,
         slug,
         name: slug,
         labels: [first.label],
         lastTouchAt: new Date(),
         ...extra,
      },
   })

const invite = (slug: string, origin: string, extra: Record<string, unknown> = {}) =>
   db.linkedInInvite.create({
      data: {
         userId,
         accountId,
         slug,
         name: slug,
         state: 'SENT',
         plannedAt: new Date(),
         invitedAt: new Date(),
         originWorkflowId: origin,
         ...extra,
      },
   })

const workflow = async (name: string) =>
   (
      await WorkflowService.create(userId, {
         name: `${name} ${randomUUID().slice(0, 8)}`,
         goal: null,
         graph,
      })
   ).id

describe('campaigns (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      first = await CampaignService.create(userId, { name: 'Outbound for agencies' })
      second = await CampaignService.create(userId, { name: 'Other' })
      workflowA = await workflow('Invite A')
      workflowB = await workflow('Invite B')
      await CampaignService.place(userId, workflowA, first.id, 'INVITE')
      await CampaignService.place(userId, workflowB, second.id, 'DISCOVER')
      accountId = (
         await db.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: 'x',
               secretIv: 'x',
               secretTag: 'x',
               status: 'ACTIVE',
            },
         })
      ).id

      await person('a1', {
         fit: 'STRONG',
         score: 85,
         lastSentAt: new Date(Date.now() - HOUR_MS),
         lastReceivedAt: new Date(),
      })
      await person('a2', {
         lastSentAt: new Date(Date.now() - 6 * DAY_MS),
         labels: [first.label, 'control'],
      })
      await person('b1', { labels: [second.label] })
      await invite('a1', workflowA, {
         acceptedAt: new Date(),
         noteSent: true,
      })
      await invite('a2', workflowA, { noteSent: false })
      await invite('b1', workflowB)
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should refuse a name that gives the same label, and keep campaigns of one owner apart', async () => {
      await expect(CampaignService.create(userId, { name: 'Outbound  for Agencies!' })).rejects.toThrow('same label')
      expect((await CampaignService.create(otherUserId, { name: 'Outbound for agencies' })).label).toBe(first.label)
      expect((await CampaignService.list(userId)).map(({ name }) => name).sort()).toEqual([
         'Other',
         'Outbound for agencies',
      ])
      expect(await CampaignStatsService.overview(otherUserId, first.id, '7d')).toBeNull()
      expect(await CampaignService.place(otherUserId, workflowA, null, 'OTHER')).toBe(false)
   })

   it('should count the funnel of one campaign only, from its label and its workflows', async () => {
      const page = await CampaignStatsService.overview(userId, first.id, '7d')

      expect(page?.funnel).toMatchObject({
         found: 2,
         qualified: 1,
         invited: 2,
         accepted: 1,
         messaged: 2,
         replied: 1,
         silent: 1,
         handedOver: 0,
      })
      expect(page?.workflows.map(({ stage }) => stage)).toEqual(['INVITE'])
      expect((await CampaignStatsService.overview(userId, second.id, '7d'))?.funnel).toMatchObject({
         found: 1,
         invited: 1,
         accepted: 0,
      })
   })

   it('should cut the invites by fit, by note and by account, with their sizes, and keep the control group apart', async () => {
      const page = await CampaignStatsService.overview(userId, first.id, '7d')

      expect(page?.cuts.byBand.map(({ key, invited, accepted }) => [key, invited, accepted]).sort()).toEqual([
         ['NONE', 1, 0],
         ['STRONG', 1, 1],
      ])
      expect(page?.cuts.byNote.map(({ key, invited, accepted }) => [key, invited, accepted]).sort()).toEqual([
         ['with', 1, 1],
         ['without', 1, 0],
      ])
      expect(page?.cuts.byAccount).toEqual([
         expect.objectContaining({
            invited: 2,
            accepted: 1,
         }),
      ])
      expect(page?.warmUp).toEqual({
         warm: {
            invited: 0,
            accepted: 0,
         },
         control: {
            invited: 1,
            accepted: 0,
         },
      })
      expect(page?.histogram[8]).toBe(1)
   })

   it('should tell the owner what needs them: a draft that waits and an account that is not signed in', async () => {
      await db.linkedInAccount.update({
         where: { id: accountId },
         data: { status: 'NEEDS_REAUTH' },
      })
      await db.draft.create({
         data: {
            userId,
            kind: 'COMMENT',
            mode: 'TEXTS',
            slug: 'a1',
            targetKey: 'activity:1',
            words: 'Hello there?',
            maxChars: 240,
            expiresAt: new Date(Date.now() + DAY_MS),
            originWorkflowId: workflowA,
            originRunId: 'r1',
            originNodeId: 'ask',
         },
      })

      const page = await CampaignStatsService.overview(userId, first.id, '7d')

      expect(page?.needsYou.map(({ kind }) => kind).sort()).toEqual(['ACCOUNT', 'DRAFTS'])
      expect(page?.accounts[0]).toMatchObject({ health: 'WARNING' })
   })

   it('should pause the workflows of a campaign, cancel what is queued only when asked, and resume the same ones', async () => {
      await WorkflowService.update(userId, workflowA, { enabled: true })
      await WorkflowService.update(userId, workflowB, { enabled: true })
      await invite('queued-1', workflowA, {
         state: 'QUEUED',
         invitedAt: null,
      })
      await db.linkedInReply.createMany({
         data: [
            {
               userId,
               accountId,
               text: 'Queued by the campaign',
               state: 'QUEUED',
               recipientSlug: 'q1',
               originWorkflowId: workflowA,
               originRunId: 'r1',
               originNodeId: 'message',
            },
            {
               userId,
               accountId,
               text: 'Queued by another campaign',
               state: 'QUEUED',
               recipientSlug: 'q2',
               originWorkflowId: workflowB,
               originRunId: 'r2',
               originNodeId: 'message',
            },
            {
               userId,
               accountId,
               text: 'Already sending',
               state: 'SENDING',
               recipientSlug: 'q3',
               originWorkflowId: workflowA,
               originRunId: 'r3',
               originNodeId: 'message',
            },
         ],
      })

      expect(await CampaignService.pause(userId, first.id, false)).toEqual({ switchedOff: 1 })
      expect((await db.linkedInReply.findFirstOrThrow({ where: { text: 'Queued by the campaign' } })).state).toBe(
         'QUEUED'
      )
      expect((await db.workflow.findUniqueOrThrow({ where: { id: workflowA } })).enabled).toBe(false)
      expect((await db.workflow.findUniqueOrThrow({ where: { id: workflowB } })).enabled).toBe(true)
      expect((await db.linkedInInvite.findFirstOrThrow({ where: { slug: 'queued-1' } })).state).toBe('QUEUED')

      await CampaignService.pause(userId, first.id, true)

      expect((await db.linkedInInvite.findFirstOrThrow({ where: { slug: 'queued-1' } })).state).toBe('CANCELLED')
      expect(await db.linkedInReply.findFirstOrThrow({ where: { text: 'Queued by the campaign' } })).toMatchObject({
         state: 'FAILED',
         failure: 'The campaign was paused.',
      })
      expect((await db.linkedInReply.findFirstOrThrow({ where: { text: 'Queued by another campaign' } })).state).toBe(
         'QUEUED'
      )
      expect((await db.linkedInReply.findFirstOrThrow({ where: { text: 'Already sending' } })).state).toBe('SENDING')
      expect((await db.draft.findFirstOrThrow({ where: { targetKey: 'activity:1' } })).state).toBe('CANCELLED')
      expect(await CampaignService.resume(userId, first.id)).toEqual({ switchedOn: 1 })
      expect((await db.workflow.findUniqueOrThrow({ where: { id: workflowA } })).enabled).toBe(true)
      expect((await CampaignService.get(userId, first.id))?.pausedAt).toBeNull()
   })

   it('should keep the workflows when a campaign is deleted, and write the same rollup again', async () => {
      await CampaignRollupService.run()
      await CampaignRollupService.run()

      const days = await db.campaignDay.findMany({ where: { campaignId: first.id } })

      expect(days).toHaveLength(2)
      expect(days.reduce((sum, day) => sum + day.invited, 0)).toBe(2)
      expect(await CampaignService.remove(userId, first.id)).toBe(true)
      expect((await db.workflow.findUniqueOrThrow({ where: { id: workflowA } })).campaignId).toBeNull()
      expect(
         await db.person.count({
            where: {
               userId,
               labels: { has: first.label },
            },
         })
      ).toBe(2)
   })
})
