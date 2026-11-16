import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type Graph } from '@automatedLinkedIn/contracts'

import { CampaignService } from './campaign.service'
import { CampaignRollupService } from './campaignRollup.service'
import { CampaignStarterService } from './campaignStarter.service'
import { CampaignStatsService } from './campaignStats.service'
import { ConflictError } from './conflict'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowService, readGraph } from './workflow.service'

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

describe('starting a campaign (database)', () => {
   const starter = `${randomUUID()}@elitale.com`
   const answers = {
      phrases: ['onboarding too slow'],
      customer: { includeTitles: ['Founder'] },
      message: 'Hi {first_name}, thanks for connecting.',
   }
   let owner: string

   const make = async (name: string, note: string) =>
      (
         await CampaignStarterService.createOutreach(owner, {
            ...answers,
            name,
            note,
         })
      ).campaignId
   const stages = async (campaignId: string) =>
      Object.fromEntries(
         (await db.workflow.findMany({ where: { campaignId } })).map(workflowRow => [workflowRow.stage, workflowRow])
      )
   const armed = (graphJson: unknown) => readGraph(graphJson).nodes.filter(({ config }) => config.actForReal === true)

   beforeAll(async () => {
      owner = (await UserService.create({ email: starter })).id
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email: starter } })
   })

   it('should switch on Discover and Invite and arm every Send invite block, and nothing else', async () => {
      const id = await make('Start with a note', 'Hi {first_name}, I liked your post.')

      await expect(CampaignService.start(owner, id, { sendInvites: true })).resolves.toEqual({
         switchedOn: 2,
         armed: 2,
      })

      const byStage = await stages(id)

      expect([byStage.DISCOVER?.enabled, byStage.INVITE?.enabled]).toEqual([true, true])
      expect(
         [byStage.WARM_UP, byStage.FIRST_MESSAGE, byStage.HAND_OFF, byStage.NO_ANSWER].map(each => each?.enabled)
      ).toEqual([false, false, false, false])
      expect(armed(byStage.INVITE?.graph).map(({ type }) => type)).toEqual(['account.sendInvite', 'account.sendInvite'])

      for (const stage of ['DISCOVER', 'WARM_UP', 'FIRST_MESSAGE', 'HAND_OFF', 'NO_ANSWER']) {
         expect(armed(byStage[stage]?.graph), stage).toEqual([])
      }
   })

   it('should arm the one Send invite block of a campaign without a note, and arm nothing when not asked', async () => {
      const plain = await make('Start without a note', '')
      const careful = await make('Start without arming', '')

      await expect(CampaignService.start(owner, plain, { sendInvites: true })).resolves.toMatchObject({ armed: 1 })
      await expect(CampaignService.start(owner, careful, { sendInvites: false })).resolves.toEqual({
         switchedOn: 2,
         armed: 0,
      })
      expect(armed((await stages(careful)).INVITE?.graph)).toEqual([])
      expect((await stages(careful)).INVITE?.enabled).toBe(true)
   })

   it('should change nothing when it is called again', async () => {
      const id = await make('Start twice', 'Hi {first_name}.')

      await CampaignService.start(owner, id, { sendInvites: true })

      const before = await stages(id)

      await expect(CampaignService.start(owner, id, { sendInvites: true })).resolves.toEqual({
         switchedOn: 0,
         armed: 2,
      })
      expect((await stages(id)).INVITE?.updatedAt).toEqual(before.INVITE?.updatedAt)
   })

   it('should refuse a paused campaign, a campaign with nothing to start, and one that is not the owners', async () => {
      const paused = await make('Start paused', '')
      const empty = await CampaignService.create(owner, { name: 'Start empty' })

      await CampaignService.pause(owner, paused, false)
      await expect(CampaignService.start(owner, paused, { sendInvites: true })).rejects.toThrow('Resume it first')
      expect((await stages(paused)).INVITE?.enabled).toBe(false)
      await expect(CampaignService.start(owner, empty.id, { sendInvites: true })).rejects.toThrow('nothing to start')
      await expect(CampaignService.start(userId, paused, { sendInvites: true })).resolves.toBeNull()
   })

   it('should not overwrite a workflow that was saved elsewhere while it was being armed', async () => {
      const id = await make('Start stale', '')
      const invite = (await stages(id)).INVITE
      const update = WorkflowService.update.bind(WorkflowService)
      const spy = vi.spyOn(WorkflowService, 'update').mockImplementation(async (...args) => {
         if (args[2].graph) {
            await new Promise(resolve => setTimeout(resolve, 5))
            await db.workflow.update({
               where: { id: args[1] },
               data: { goal: 'saved elsewhere' },
            })
         }

         return update(...args)
      })

      try {
         await expect(CampaignService.start(owner, id, { sendInvites: true })).rejects.toBeInstanceOf(ConflictError)
      } finally {
         spy.mockRestore()
      }

      expect(armed((await db.workflow.findUniqueOrThrow({ where: { id: invite?.id ?? '' } })).graph)).toEqual([])
   })

   it('should switch Discover off again when Invite cannot be switched on', async () => {
      const id = await make('Start rolls back', '')
      const invite = (await stages(id)).INVITE
      const update = WorkflowService.update.bind(WorkflowService)
      const spy = vi.spyOn(WorkflowService, 'update').mockImplementation((...args) => {
         if (args[1] === invite?.id && args[2].enabled === true) {
            return Promise.reject(new ConflictError('Fix the problems in the workflow before switching it on.'))
         }

         return update(...args)
      })

      try {
         await expect(CampaignService.start(owner, id, { sendInvites: true })).rejects.toThrow('Fix the problems')
      } finally {
         spy.mockRestore()
      }

      expect([(await stages(id)).DISCOVER?.enabled, (await stages(id)).INVITE?.enabled]).toEqual([false, false])
   })
})
