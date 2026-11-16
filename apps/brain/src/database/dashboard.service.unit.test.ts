import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardService } from './dashboard.service'

const mocks = vi.hoisted(() => ({
   listCampaigns: vi.fn(),
   waiting: vi.fn(),
   forUser: vi.fn(),
   usableCapacityOf: vi.fn(),
   pipeline: vi.fn(),
   countedBetween: vi.fn(),
   firstDays: vi.fn(),
   dayRows: vi.fn(),
   workflows: vi.fn(),
   runs: vi.fn(),
   forAccounts: vi.fn(),
   belowFloor: vi.fn(),
   draftCounts: vi.fn(),
   alerts: vi.fn(),
}))

vi.mock('./campaign.service', () => ({ CampaignService: { list: mocks.listCampaigns } }))
vi.mock('./campaignTrend.service', () => ({ CampaignTrendService: { waiting: mocks.waiting } }))
vi.mock('./fleetHealth.service', () => ({ FleetHealthService: { forUser: mocks.forUser } }))
vi.mock('./linkedInInvite.service', () => ({ LinkedInInviteService: { usableCapacityOf: mocks.usableCapacityOf } }))
vi.mock('./positiveReply.service', () => ({
   PositiveReplyService: {
      pipeline: mocks.pipeline,
      countedBetween: mocks.countedBetween,
   },
}))
vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         campaignDay: {
            groupBy: mocks.firstDays,
            findMany: mocks.dayRows,
         },
         workflow: { findMany: mocks.workflows },
         workflowRun: { findMany: mocks.runs },
      },
   },
}))
vi.mock('./roomToday.service', () => ({ RoomTodayService: { forAccounts: mocks.forAccounts } }))
vi.mock('./wallet.service', () => ({ WalletService: { belowFloor: mocks.belowFloor } }))
vi.mock('./draft.service', () => ({ DraftService: { counts: mocks.draftCounts } }))
vi.mock('./workflow.service', () => ({ WorkflowService: { alerts: mocks.alerts } }))

const NOW = new Date('2026-11-15T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
// The latest complete day is 2026-11-13.
const dayAt = (back: number) => new Date(Date.parse('2026-11-13') - back * DAY_MS).toISOString().slice(0, 10)

const deferred = <T>() => {
   let resolve: (value: T) => void = () => undefined
   const promise = new Promise<T>(done => {
      resolve = done
   })

   return {
      promise,
      resolve,
   }
}

const campaign = (id: string, patch: Record<string, unknown> = {}) => ({
   id,
   name: `Campaign ${id}`,
   label: `lead-${id}`,
   pausedAt: null,
   createdAt: new Date('2026-06-01T08:00:00.000Z'),
   workflows: 1,
   ...patch,
})

const started = (id: string) => ({
   campaignId: id,
   _min: { day: '2026-06-02' },
})

const workflow = (id: string, campaignId: string | null, patch: Record<string, unknown> = {}) => ({
   id,
   name: `Workflow ${id}`,
   stage: 'INVITE',
   enabled: true,
   campaignId,
   campaign: campaignId ? { name: `Campaign ${campaignId}` } : null,
   ...patch,
})

// Rows for the 14 complete days of the gate with 28 invites, so a projection is shown or hidden for a real reason.
const gateRows = (campaignId: string) =>
   Array.from({ length: 14 }, (_, index) => ({
      campaignId,
      day: dayAt(13 - index),
      found: 1,
      qualified: 1,
      invited: 2,
      accepted: 1,
      messaged: 0,
      replied: 0,
   }))

const account = (patch: Record<string, unknown> = {}) => ({
   accountId: 'a1',
   name: 'Ada',
   email: 'ada@example.com',
   status: 'ACTIVE',
   createdAt: new Date('2026-01-01T00:00:00.000Z'),
   statusUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
   health: 'HEALTHY',
   reasons: [],
   invites: {
      limit: 20,
      used: 5,
   },
   pending: {
      count: 0,
      share: 0,
   },
   invitedLast14: 0,
   acceptedLast14: 0,
   invitesStopped: false,
   engageStopped: false,
   stopOpenEnded: false,
   stopUntil: null,
   stopAt: null,
   ...patch,
})

const overview = (isAdmin = false) => DashboardService.overview('u1', isAdmin, NOW)

const seedRunning = (ids: string[]) => {
   mocks.listCampaigns.mockResolvedValue(ids.map(id => campaign(id)))
   mocks.firstDays.mockResolvedValue(ids.map(started))
   mocks.workflows.mockResolvedValue(ids.map(id => workflow(`w-${id}`, id)))
}

describe('DashboardService.overview', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.listCampaigns.mockResolvedValue([])
      mocks.firstDays.mockResolvedValue([])
      mocks.dayRows.mockResolvedValue([])
      mocks.workflows.mockResolvedValue([])
      mocks.runs.mockResolvedValue([])
      mocks.usableCapacityOf.mockResolvedValue({
         perDay: 20,
         perWeek: 100,
         usableAccounts: 1,
      })
      mocks.forUser.mockResolvedValue([])
      mocks.forAccounts.mockResolvedValue([])
      mocks.belowFloor.mockResolvedValue(false)
      mocks.pipeline.mockResolvedValue({
         campaigns: [],
         totalUsd: null,
         unassigned: 0,
      })
      mocks.countedBetween.mockResolvedValue(0)
      mocks.draftCounts.mockResolvedValue({ waiting: 0 })
      mocks.alerts.mockResolvedValue([])
      mocks.waiting.mockResolvedValue(0)
   })

   it('should answer zeros, empty lists and nothing unavailable for an owner with nothing', async () => {
      const result = await overview()

      expect(result).toMatchObject({
         generatedAt: NOW.toISOString(),
         unavailable: [],
         campaigns: [],
         accounts: [],
         runs: [],
         attention: [],
         cards: {
            pipeline: {
               totalUsd: null,
               replies: 0,
               replyChange: { kind: 'none' },
            },
            qualified: {
               current: 0,
               change: { kind: 'none' },
            },
            accounts: {
               active: 0,
               total: 0,
               needAttention: 0,
               roomToday: 0,
               firstAttention: null,
            },
         },
      })
      expect(result.series).toHaveLength(90)
      expect(mocks.waiting).not.toHaveBeenCalled()
   })

   it('should hand the one now to every read that takes it, and scope the reads to the owner', async () => {
      mocks.forUser.mockResolvedValue([account()])

      await overview()

      expect(mocks.usableCapacityOf).toHaveBeenCalledWith('u1', NOW)
      expect(mocks.forUser).toHaveBeenCalledWith('u1', NOW)
      expect(mocks.draftCounts).toHaveBeenCalledWith('u1', NOW)
      expect(mocks.forAccounts).toHaveBeenCalledWith('u1', ['a1'], 'invite', NOW)
      expect(mocks.listCampaigns).toHaveBeenCalledWith('u1')
      expect(mocks.alerts).toHaveBeenCalledWith('u1')
      expect(mocks.pipeline).toHaveBeenCalledWith('u1')
      expect(mocks.firstDays.mock.calls[0][0].where).toEqual({ campaign: { userId: 'u1' } })
      expect(mocks.dayRows.mock.calls[0][0].where).toEqual({
         campaign: { userId: 'u1' },
         day: {
            gte: dayAt(89),
            lte: dayAt(0),
         },
      })
      expect(mocks.workflows.mock.calls[0][0].where).toEqual({ userId: 'u1' })
   })

   it('should read only the main runs of the owner workflows from the last 30 days, 50 at most, never a preview', async () => {
      mocks.workflows.mockResolvedValue([workflow('w1', null), workflow('w2', null)])

      await overview()

      expect(mocks.runs.mock.calls[0][0]).toMatchObject({
         where: {
            userId: 'u1',
            workflowId: { in: ['w1', 'w2'] },
            kind: 'MAIN',
            trigger: { not: 'PREVIEW' },
            startedAt: { gte: new Date('2026-10-16T12:00:00.000Z') },
         },
         orderBy: { startedAt: 'desc' },
         take: 50,
      })
      expect(mocks.runs.mock.calls[0][0].select).not.toHaveProperty('graph')
   })

   it.each([
      ['the campaigns', () => mocks.listCampaigns],
      ['their first days', () => mocks.firstDays],
      ['their days', () => mocks.dayRows],
      ['the workflows', () => mocks.workflows],
      ['the accounts', () => mocks.forUser],
      ['the pipeline', () => mocks.pipeline],
   ])('should reject the call when %s cannot be read', async (_name, read) => {
      read().mockRejectedValue(new Error('down'))

      await expect(overview()).rejects.toThrow('down')
   })

   describe('a soft read that fails', () => {
      it('should name the capacity as status and hide what depends on the projection', async () => {
         mocks.usableCapacityOf.mockRejectedValue(new Error('down'))
         seedRunning(['c1'])
         mocks.dayRows.mockResolvedValue(gateRows('c1'))

         const result = await overview()

         expect(result.unavailable).toEqual(['status'])
         expect(result.campaigns[0].status).toBe('none')
         expect(mocks.waiting).not.toHaveBeenCalled()
      })

      it('should name the wallet as status for everyone and as wallet for an admin, and leave the wallet row out', async () => {
         mocks.belowFloor.mockRejectedValue(new Error('down'))

         expect((await overview(false)).unavailable).toEqual(['status'])

         const admin = await overview(true)

         expect(admin.unavailable).toEqual(['status', 'wallet'])
         expect(admin.attention).toEqual([])
      })

      it('should name the reply counts and show no change', async () => {
         mocks.countedBetween.mockRejectedValue(new Error('down'))

         const result = await overview()

         expect(result.unavailable).toEqual(['replies'])
         expect(result.cards.pipeline.replyChange).toEqual({ kind: 'none' })
      })

      it('should name the drafts and leave their row out', async () => {
         mocks.draftCounts.mockRejectedValue(new Error('down'))

         const result = await overview()

         expect(result.unavailable).toEqual(['drafts'])
         expect(result.attention).toEqual([])
      })

      it('should name the failed runs and leave their rows out', async () => {
         mocks.alerts.mockRejectedValue(new Error('down'))

         const result = await overview()

         expect(result.unavailable).toEqual(['alerts'])
         expect(result.attention).toEqual([])
      })

      it('should name the recent runs and leave the tab empty', async () => {
         mocks.runs.mockRejectedValue(new Error('down'))

         const result = await overview()

         expect(result.unavailable).toEqual(['runs'])
         expect(result.runs).toEqual([])
      })

      it('should name the room and show no number for it', async () => {
         mocks.forUser.mockResolvedValue([account()])
         mocks.forAccounts.mockRejectedValue(new Error('down'))

         const result = await overview()

         expect(result.unavailable).toEqual(['room'])
         expect(result.cards.accounts.roomToday).toBeNull()
         expect(result.cards.accounts.active).toBe(1)
      })

      it('should name the waiting counts once however many fail, and leave the few-waiting rows out', async () => {
         seedRunning(['c1', 'c2'])
         mocks.waiting.mockRejectedValue(new Error('down'))

         const result = await overview()

         expect(result.unavailable).toEqual(['waiting'])
         expect(mocks.waiting).toHaveBeenCalledTimes(2)
         expect(result.attention).toEqual([])
      })

      it('should list the names in the fixed order', async () => {
         mocks.alerts.mockRejectedValue(new Error('down'))
         mocks.draftCounts.mockRejectedValue(new Error('down'))
         mocks.belowFloor.mockRejectedValue(new Error('down'))

         expect((await overview(true)).unavailable).toEqual(['status', 'wallet', 'drafts', 'alerts'])
      })
   })

   describe('the wallet', () => {
      it('should feed the campaign status for everyone and the wallet row for an admin only', async () => {
         seedRunning(['c1'])
         mocks.dayRows.mockResolvedValue(gateRows('c1'))
         mocks.belowFloor.mockResolvedValue(true)

         const admin = await overview(true)
         const owner = await overview(false)

         expect(admin.campaigns[0].status).toBe('onHold')
         expect(owner.campaigns[0].status).toBe('onHold')
         expect(admin.attention.map(({ id }) => id)).toContain('wallet-low:platform')
         expect(owner.attention.map(({ id }) => id)).not.toContain('wallet-low:platform')
      })

      it('should call a running campaign on track only when nothing is known to block it', async () => {
         seedRunning(['c1'])
         mocks.dayRows.mockResolvedValue(gateRows('c1'))

         expect((await overview()).campaigns[0].status).toBe('onTrack')
      })
   })

   describe('the waiting counts', () => {
      it('should ask only for running campaigns with an enabled Invite workflow', async () => {
         mocks.listCampaigns.mockResolvedValue([
            campaign('run'),
            campaign('paused', { pausedAt: new Date('2026-11-01T00:00:00.000Z') }),
            campaign('fresh'),
            campaign('off'),
            campaign('other-stage'),
            campaign('bare', { workflows: 0 }),
         ])
         mocks.firstDays.mockResolvedValue(['run', 'paused', 'off', 'other-stage', 'bare'].map(started))
         mocks.workflows.mockResolvedValue([
            workflow('w1', 'run'),
            workflow('w2', 'paused'),
            workflow('w3', 'fresh'),
            workflow('w4', 'off', { enabled: false }),
            workflow('w5', 'other-stage', { stage: 'DISCOVER' }),
            workflow('w6', 'bare'),
            workflow('w7', null),
         ])

         await overview()

         expect(mocks.waiting.mock.calls).toEqual([['u1', 'lead-run']])
      })

      it('should not ask when no account can invite, or when the daily share is under one invite', async () => {
         seedRunning(['c1', 'c2'])
         mocks.usableCapacityOf.mockResolvedValue({
            perDay: 20,
            perWeek: 100,
            usableAccounts: 0,
         })

         await overview()

         expect(mocks.waiting).not.toHaveBeenCalled()

         mocks.usableCapacityOf.mockResolvedValue({
            perDay: 1,
            perWeek: 7,
            usableAccounts: 1,
         })

         await overview()

         expect(mocks.waiting).not.toHaveBeenCalled()
      })

      it('should count four at a time and turn few waiting into a row for each campaign', async () => {
         const ids = Array.from({ length: 9 }, (_, index) => `c${index}`)
         const pending: Array<ReturnType<typeof deferred<number>>> = []

         seedRunning(ids)
         mocks.usableCapacityOf.mockResolvedValue({
            perDay: 90,
            perWeek: 630,
            usableAccounts: 1,
         })
         mocks.waiting.mockImplementation(() => {
            const next = deferred<number>()
            pending.push(next)

            return next.promise
         })

         const result = overview()
         const settleBatch = async (calls: number) => {
            await vi.waitFor(() => expect(mocks.waiting).toHaveBeenCalledTimes(calls))
            await new Promise(done => setTimeout(done, 10))
            expect(mocks.waiting).toHaveBeenCalledTimes(calls)
            for (const next of pending.splice(0)) next.resolve(3)
         }

         await settleBatch(4)
         await settleBatch(8)
         await settleBatch(9)

         const { attention } = await result

         expect(attention.filter(({ rule }) => rule === 'few-waiting')).toHaveLength(9)
         expect(attention[0].sentence).toBe(
            'Campaign c0 has 3 people waiting to be invited, fewer than the 10 it can invite in a day.'
         )
      })
   })

   describe('the stages', () => {
      it('should start the waiting counts and the runs without waiting for a slow soft read, and the replies once the days are in', async () => {
         const wallet = deferred<boolean>()
         const days = deferred<unknown[]>()

         seedRunning(['c1'])
         mocks.belowFloor.mockReturnValue(wallet.promise)
         mocks.dayRows.mockReturnValue(days.promise)

         const result = overview()

         await vi.waitFor(() => expect(mocks.waiting).toHaveBeenCalledTimes(1))
         await vi.waitFor(() => expect(mocks.runs).toHaveBeenCalledTimes(1))
         expect(mocks.countedBetween).not.toHaveBeenCalled()

         days.resolve(gateRows('c1'))
         await vi.waitFor(() => expect(mocks.countedBetween).toHaveBeenCalledTimes(3))

         wallet.resolve(false)
         await result
      })

      it('should count the replies of the current and the previous 30 days for the covered campaigns, and the current for all', async () => {
         seedRunning(['old'])
         mocks.firstDays.mockResolvedValue([
            {
               campaignId: 'old',
               _min: { day: dayAt(89) },
            },
         ])
         mocks.dayRows.mockResolvedValue(
            Array.from({ length: 90 }, (_, index) => ({
               campaignId: 'old',
               day: dayAt(89 - index),
               found: 1,
               qualified: 1,
               invited: 1,
               accepted: 0,
               messaged: 0,
               replied: 0,
            }))
         )
         mocks.countedBetween.mockResolvedValueOnce(3).mockResolvedValueOnce(1).mockResolvedValueOnce(5)

         const result = await overview()
         const day = (value: string) => new Date(`${value}T00:00:00.000Z`)

         expect(mocks.countedBetween.mock.calls).toEqual([
            ['u1', day(dayAt(29)), day('2026-11-14'), ['old']],
            ['u1', day(dayAt(59)), day(dayAt(29)), ['old']],
            ['u1', day(dayAt(29)), day('2026-11-14'), null],
         ])
         expect(result.cards.pipeline.replyChange).toEqual({
            kind: 'percent',
            value: 200,
         })
      })
   })

   it('should shape the accounts, the campaign rows with their money, and the runs, and never pass the run message on', async () => {
      mocks.listCampaigns.mockResolvedValue([campaign('c1')])
      mocks.firstDays.mockResolvedValue([started('c1')])
      mocks.workflows.mockResolvedValue([workflow('w1', 'c1', { stage: 'DISCOVER' })])
      mocks.pipeline.mockResolvedValue({
         campaigns: [
            {
               id: 'c1',
               replies: 2,
               replyValueUsd: null,
               pipelineUsd: null,
            },
         ],
         totalUsd: null,
         unassigned: 0,
      })
      mocks.forUser.mockResolvedValue([account({ status: 'NEEDS_REAUTH' })])
      mocks.alerts.mockResolvedValue([
         {
            runId: 'r9',
            workflowId: 'w1',
            workflowName: 'Workflow w1',
            message: 'token=secret',
            finishedAt: new Date('2026-11-15T10:00:00.000Z'),
         },
      ])
      mocks.runs.mockResolvedValue([
         {
            id: 'r1',
            workflowId: 'w1',
            status: 'SUCCEEDED',
            qualified: 2,
            maybe: 1,
            discarded: 0,
            costMicros: 10,
            startedAt: new Date('2026-11-14T00:00:00.000Z'),
         },
      ])

      const result = await overview()

      expect(result.accounts).toHaveLength(1)
      expect(result.campaigns[0]).toMatchObject({
         id: 'c1',
         pipelineUsd: null,
         replyValueUsd: null,
      })
      expect(result.runs).toEqual([
         expect.objectContaining({
            id: 'r1',
            workflow: 'Workflow w1',
            campaign: 'Campaign c1',
            scored: 3,
            qualified: 2,
         }),
      ])
      expect(result.attention.map(({ id }) => id)).toEqual(['account-signed-out:a1', 'run-failed:r9', 'no-worth:c1'])
      expect(JSON.stringify(result)).not.toContain('secret')
   })
})
