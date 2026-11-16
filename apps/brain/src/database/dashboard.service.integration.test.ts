import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CampaignService } from './campaign.service'
import { DashboardService } from './dashboard.service'
import { PositiveReplyService } from './positiveReply.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WalletService, floorMicros } from './wallet.service'
import { WorkflowService } from './workflow.service'

// Needs PostgreSQL. The owner's dashboard against real rows: the numbers of the plan's fixture, the owner scoping, the admin wallet
// row, and one big owner (50 campaigns) for the timing (.plan/dashboard-analytics.md).

const db = PrismaService.client
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
// The latest complete day is 2026-11-13.
const NOW = new Date('2026-11-15T12:00:00.000Z')
const EMPTY = {
   nodes: [],
   edges: [],
}
const dayAt = (back: number) => new Date(Date.parse('2026-11-13') - back * DAY_MS).toISOString().slice(0, 10)
const at = (back: number, hour = 10) => new Date(`${dayAt(back)}T${String(hour).padStart(2, '0')}:00:00.000Z`)

const users: string[] = []

const makeUser = async (role: 'USER' | 'ADMIN' = 'USER') => {
   const user = await UserService.create({ email: `${randomUUID()}@elitale.com` })

   if (role === 'ADMIN')
      await db.user.update({
         where: { id: user.id },
         data: { role },
      })
   users.push(user.id)

   return user.id
}

const makeCampaign = async (userId: string, name: string, createdAt: Date) => {
   const campaign = await CampaignService.create(userId, { name: `${name} ${randomUUID().slice(0, 8)}` })

   await db.campaign.update({
      where: { id: campaign.id },
      data: { createdAt },
   })

   return campaign
}

const rowsFor = (campaignId: string, from: number, to: number, counts: Record<string, number>) =>
   db.campaignDay.createMany({
      data: Array.from({ length: from - to + 1 }, (_, index) => ({
         campaignId,
         day: dayAt(from - index),
         ...counts,
      })),
   })

const makeAccount = (userId: string, extra: Record<string, unknown> = {}) =>
   db.linkedInAccount.create({
      data: {
         userId,
         email: `${randomUUID()}@example.com`,
         secret: 'x',
         secretIv: 'x',
         secretTag: 'x',
         status: 'ACTIVE',
         lastVerifiedAt: NOW,
         ...extra,
      },
   })

const makeWorkflow = (userId: string, name: string) =>
   WorkflowService.create(userId, {
      name: `${name} ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph: EMPTY,
   })

const makeRun = (
   userId: string,
   workflowId: string,
   patch: { trigger: 'MANUAL' | 'PREVIEW'; kind: 'MAIN' | 'HOOK'; finishedAt: Date }
) =>
   db.workflowRun.create({
      data: {
         userId,
         workflowId,
         runKey: `run-${randomUUID()}`,
         status: 'FAILED',
         graph: EMPTY,
         qualifyScore: 60,
         maybeScore: 40,
         maybeEnabled: true,
         message: 'boom token=secret',
         startedAt: new Date(NOW.getTime() - HOUR_MS),
         ...patch,
      },
   })

const reply = (userId: string, campaignId: string | null, slug: string, createdAt: Date) =>
   db.positiveReply.create({
      data: {
         userId,
         campaignId,
         slug,
         source: 'MARKED',
         createdAt,
      },
   })

const overview = (userId: string, isAdmin = false) => DashboardService.overview(userId, isAdmin, NOW)

afterAll(async () => {
   await db.user.deleteMany({ where: { id: { in: users } } })
   await PrismaService.disconnect()
})

describe('DashboardService.overview (database)', () => {
   let owner: string
   let other: string
   let campaignA: string
   let campaignB: string
   let resting: string
   let signedOut: string
   let mainRun: string
   let hookRun: string

   beforeAll(async () => {
      owner = await makeUser()
      other = await makeUser()

      const a = await makeCampaign(owner, 'A', new Date(NOW.getTime() - 100 * DAY_MS))
      const b = await makeCampaign(owner, 'B', new Date(NOW.getTime() - 10 * DAY_MS))

      campaignA = a.id
      campaignB = b.id
      await rowsFor(a.id, 99, 0, {
         found: 2,
         qualified: 1,
         invited: 1,
         accepted: 0,
      })
      await rowsFor(b.id, 8, 0, { found: 1 })

      resting = (
         await makeAccount(owner, {
            invitesStoppedAt: new Date(NOW.getTime() - DAY_MS),
            invitesStopUntil: null,
            lastVerifiedAt: null,
         })
      ).id
      signedOut = (await makeAccount(owner, { status: 'NEEDS_REAUTH' })).id

      const discover = await makeWorkflow(owner, 'Discover')

      await CampaignService.place(owner, discover.id, a.id, 'DISCOVER')
      mainRun = (
         await makeRun(owner, discover.id, {
            trigger: 'MANUAL',
            kind: 'MAIN',
            finishedAt: new Date(),
         })
      ).id
      await makeRun(owner, discover.id, {
         trigger: 'PREVIEW',
         kind: 'MAIN',
         finishedAt: new Date(),
      })
      hookRun = (
         await makeRun(owner, discover.id, {
            trigger: 'MANUAL',
            kind: 'HOOK',
            finishedAt: new Date(Date.now() - 1000),
         })
      ).id
      await db.workflowDelivery.create({
         data: {
            userId: owner,
            workflowId: discover.id,
            source: 'BLOCK',
            hostNodeId: 'n1',
            phase: 'before',
            targets: [],
            runId: hookRun,
         },
      })

      for (const slug of ['one', 'two']) {
         await db.draft.create({
            data: {
               userId: owner,
               kind: 'COMMENT',
               mode: 'TEXTS',
               slug,
               targetKey: `activity:${slug}`,
               words: 'Hello there?',
               maxChars: 240,
               expiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
               originWorkflowId: discover.id,
               originRunId: 'r1',
               originNodeId: 'ask',
            },
         })
      }

      for (const slug of ['a1', 'a2']) await reply(owner, a.id, slug, at(5))

      // Counted, taken out and counted again: the reply keeps its first date.
      const toggled = await reply(owner, a.id, 'a3', at(5))

      await db.positiveReply.update({
         where: { id: toggled.id },
         data: { state: 'REMOVED' },
      })
      await db.positiveReply.update({
         where: { id: toggled.id },
         data: { state: 'COUNTED' },
      })
      await reply(owner, a.id, 'a-old', at(45))
      const removed = await reply(owner, a.id, 'a-removed', at(5))

      await db.positiveReply.update({
         where: { id: removed.id },
         data: { state: 'REMOVED' },
      })
      await reply(owner, b.id, 'b1', at(5))
      await reply(owner, null, 'nobody', at(5))
      await PositiveReplyService.setReplyValue(owner, a.id, 100)
   })

   it('should total the owner campaigns with like-for-like badges over the campaigns with 60 days of history', async () => {
      const { cards, generatedAt, unavailable } = await overview(owner)

      expect(generatedAt).toBe(NOW.toISOString())
      expect(unavailable).toEqual([])
      expect(cards.qualified).toEqual({
         current: 30,
         change: { kind: 'none' },
         found: 69,
      })
      expect(cards.invites).toEqual({
         current: 30,
         change: { kind: 'none' },
         accepted: 0,
         acceptRate: 0,
      })
   })

   it('should count the positive replies of campaigns, with the change over the covered one', async () => {
      const { cards } = await overview(owner)
      const pipeline = await PositiveReplyService.pipeline(owner)
      const worthOfA = pipeline.campaigns.find(({ id }) => id === campaignA)

      expect(cards.pipeline).toEqual({
         totalUsd: pipeline.totalUsd,
         replies: 5,
         replyChange: {
            kind: 'percent',
            value: 200,
         },
         campaignsWithReplies: 2,
         withReplyAndWorth: 1,
      })
      expect(cards.pipeline.totalUsd).toBe(worthOfA?.pipelineUsd)
      expect(cards.pipeline.totalUsd).toBe(4 * 100 * 12)
   })

   it('should plot 90 complete days to the cutoff, with a campaign counted only from its own first day', async () => {
      const { series } = await overview(owner)

      expect(series).toHaveLength(90)
      expect(series[89]).toEqual({
         day: dayAt(0),
         counted: 2,
         campaigns: 2,
         found: 3,
         qualified: 1,
         invited: 1,
         accepted: 0,
      })
      expect(series.find(({ day }) => day === dayAt(20))).toMatchObject({
         counted: 1,
         campaigns: 1,
         found: 2,
      })
   })

   it('should tell what needs the owner, with the failed main and hook runs but not the preview', async () => {
      const { attention, cards } = await overview(owner)

      expect(attention.map(({ id }) => id)).toEqual([
         `account-signed-out:${signedOut}`,
         `account-resting:${resting}`,
         `run-failed:${mainRun}`,
         `run-failed:${hookRun}`,
         'drafts-waiting:owner',
         `no-worth:${campaignB}`,
      ])
      expect(attention.find(({ rule }) => rule === 'account-resting')?.severity).toBe('high')
      expect(attention.find(({ rule }) => rule === 'drafts-waiting')?.sentence).toBe('2 drafts wait for your approval.')
      expect(cards.accounts).toMatchObject({
         active: 1,
         total: 2,
         needAttention: 2,
         roomToday: 0,
         firstAttention: { kind: 'needsYou' },
      })
      expect(JSON.stringify(attention)).not.toContain('secret')
   })

   it('should list the main run only in Recent runs, and the accounts and campaigns in creation order', async () => {
      const { runs, accounts, campaigns } = await overview(owner)

      expect(runs.map(({ id }) => id)).toEqual([mainRun])
      expect(runs[0]).toMatchObject({
         status: 'FAILED',
         scored: null,
         qualified: null,
      })
      expect(accounts.map(({ id, rest }) => [id, rest])).toEqual([
         [resting, 'openEnded'],
         [signedOut, 'none'],
      ])
      expect(campaigns.map(({ id }) => id)).toEqual([campaignB, campaignA])
      expect(campaigns.find(({ id }) => id === campaignA)).toMatchObject({
         state: 'RUNNING',
         qualified: 30,
         invited: 30,
         status: 'tooEarly',
      })
   })

   it('should show another owner none of it', async () => {
      const result = await overview(other)

      expect(result).toMatchObject({
         unavailable: [],
         campaigns: [],
         accounts: [],
         runs: [],
         attention: [],
         cards: {
            pipeline: {
               totalUsd: null,
               replies: 0,
            },
            qualified: {
               current: 0,
               found: 0,
            },
            invites: { current: 0 },
            accounts: {
               total: 0,
               needAttention: 0,
            },
         },
      })
      expect(result.series.every(({ counted }) => counted === 0)).toBe(true)
   })

   it('should drop a deleted campaign from the totals', async () => {
      const extra = await makeCampaign(owner, 'Extra', new Date(NOW.getTime() - 100 * DAY_MS))

      await rowsFor(extra.id, 99, 0, { found: 1 })
      expect((await overview(owner)).cards.qualified.found).toBe(99)

      await db.campaign.delete({ where: { id: extra.id } })
      expect((await overview(owner)).cards.qualified.found).toBe(69)
   })

   it('should show the wallet row to an admin only, and only below the floor', async () => {
      const admin = await makeUser('ADMIN')

      await WalletService.save(floorMicros() + 1_000_000)
      expect((await overview(admin, true)).attention).toEqual([])

      await WalletService.save(0)

      const low = await overview(admin, true)

      expect(low.attention.map(({ id }) => id)).toEqual(['wallet-low:platform'])
      expect(low.attention[0].severity).toBe('high')
      expect((await overview(owner, false)).attention.map(({ id }) => id)).not.toContain('wallet-low:platform')

      await WalletService.save(floorMicros() + 1_000_000)
   })
})

describe('DashboardService.overview (50 campaigns)', () => {
   it('should answer for 50 campaigns, 4 accounts and about 3,000 runs, and log how long it took', async () => {
      const userId = await makeUser()
      const campaigns = []

      for (let index = 0; index < 50; index += 1) {
         campaigns.push(await makeCampaign(userId, `Big ${index}`, new Date(NOW.getTime() - 100 * DAY_MS)))
      }

      for (let index = 0; index < 4; index += 1) await makeAccount(userId)

      for (const campaign of campaigns) {
         const invite = await makeWorkflow(userId, 'Invite')

         await CampaignService.place(userId, invite.id, campaign.id, 'INVITE')
         await db.workflow.update({
            where: { id: invite.id },
            data: { enabled: true },
         })
         await rowsFor(campaign.id, 89, 0, {
            found: 3,
            qualified: 1,
            invited: 2,
            accepted: 1,
         })
         await db.workflowRun.createMany({
            data: Array.from({ length: 60 }, (_, index) => ({
               userId,
               workflowId: invite.id,
               runKey: `run-${randomUUID()}`,
               trigger: 'SCHEDULE' as const,
               status: 'SUCCEEDED' as const,
               graph: EMPTY,
               qualifyScore: 60,
               maybeScore: 40,
               maybeEnabled: true,
               qualified: 2,
               maybe: 1,
               startedAt: new Date(NOW.getTime() - (index + 1) * 6 * HOUR_MS),
               finishedAt: new Date(NOW.getTime() - (index + 1) * 6 * HOUR_MS + 60_000),
            })),
         })
      }

      const started = performance.now()
      const result = await overview(userId)
      const elapsed = Math.round(performance.now() - started)

      console.info(`dashboard.overview for 50 campaigns, 4 accounts and 3,000 runs took ${elapsed} ms`)
      expect(result.campaigns).toHaveLength(50)
      expect(result.accounts).toHaveLength(4)
      expect(result.runs).toHaveLength(50)
      expect(result.unavailable).toEqual([])
      // Nobody waits in any campaign and the 4 accounts allow about 1 invite a day each, so every campaign has a few-waiting row.
      expect(result.attention.filter(({ rule }) => rule === 'few-waiting')).toHaveLength(50)
      expect(elapsed).toBeLessThan(10_000)
   })
})
