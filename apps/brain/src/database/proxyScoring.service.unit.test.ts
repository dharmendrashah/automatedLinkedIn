import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Prisma } from 'generated/prisma/client'

import { ProxyScoringService } from './proxyScoring.service'

const mocks = vi.hoisted(() => ({
   findUniqueProxy: vi.fn(),
   findFirstProxy: vi.fn(),
   findManyProxy: vi.fn(),
   updateProxy: vi.fn(),
   updateManyProxy: vi.fn(),
   createScore: vi.fn(),
   deleteManyScore: vi.fn(),
   isConfigured: vi.fn(),
   check: vi.fn(),
   AbuseIpDbError: class AbuseIpDbError extends Error {
      public kind: string
      public retryAfterSeconds?: number

      public constructor(kind: string, retryAfterSeconds?: number) {
         super(`abuse ${kind}`)
         this.kind = kind
         this.retryAfterSeconds = retryAfterSeconds
      }
   },
}))

vi.mock('core', () => ({
   AbuseIpDbError: mocks.AbuseIpDbError,
   AbuseIpDbService: {
      isConfigured: mocks.isConfigured,
      check: mocks.check,
   },
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         proxyServer: {
            findUnique: mocks.findUniqueProxy,
            findFirst: mocks.findFirstProxy,
            findMany: mocks.findManyProxy,
            update: mocks.updateProxy,
            updateMany: mocks.updateManyProxy,
         },
         proxyScore: {
            create: mocks.createScore,
            deleteMany: mocks.deleteManyScore,
         },
      },
   },
}))

const NOW = new Date('2026-10-14T10:30:00Z')

const DETAIL = {
   maxAgeInDays: 90,
   numDistinctUsers: 2,
   isWhitelisted: false,
   domain: null,
   countryCode: 'NL',
   hostnames: [],
   categories: [
      {
         id: 14,
         name: 'Port Scan',
         reports: 4,
      },
   ],
   recent: [],
}

const row = (extra: Record<string, unknown> = {}) => ({
   id: 'p1',
   status: 'ACTIVE',
   detectedIp: '203.0.113.9',
   latencyMs: 500,
   abuseIp: null,
   abuseScore: null,
   abuseCheckedAt: null,
   abuseError: null,
   ...extra,
})

const answer = (extra: Record<string, unknown> = {}) => ({
   abuseScore: 0,
   totalReports: 0,
   lastReportedAt: null,
   usageType: 'Fixed Line ISP',
   isp: 'Example ISP',
   isTor: false,
   detail: DETAIL,
   remaining: 900,
   ...extra,
})

describe('ProxyScoringService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.useFakeTimers()
      vi.setSystemTime(NOW)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.isConfigured.mockReturnValue(true)
      mocks.findFirstProxy.mockResolvedValue(null)
      mocks.updateProxy.mockResolvedValue({})
      mocks.createScore.mockResolvedValue({})
      mocks.deleteManyScore.mockResolvedValue({ count: 0 })
   })

   describe('score', () => {
      it('should do nothing for a proxy that is gone', async () => {
         mocks.findUniqueProxy.mockResolvedValue(null)

         await expect(ProxyScoringService.score('p1')).resolves.toEqual({
            stop: false,
            remaining: null,
         })
         expect(mocks.updateProxy).not.toHaveBeenCalled()
      })

      it('should ask AbuseIPDB about the exit IP and store the score and the answer', async () => {
         mocks.findUniqueProxy.mockResolvedValue(row())
         mocks.check.mockResolvedValue(
            answer({
               abuseScore: 10,
               totalReports: 4,
            })
         )

         await expect(ProxyScoringService.score('p1')).resolves.toEqual({
            stop: false,
            remaining: 900,
         })

         expect(mocks.check).toHaveBeenCalledWith('203.0.113.9')
         expect(mocks.updateProxy.mock.calls[0][0]).toMatchObject({
            where: { id: 'p1' },
            data: {
               score: 93,
               scoredAt: NOW,
               scoreHasReputation: true,
               abuseIp: '203.0.113.9',
               abuseScore: 10,
               abuseReports: 4,
               abuseUsageType: 'Fixed Line ISP',
               abuseIsp: 'Example ISP',
               abuseIsTor: false,
               abuseCheckedAt: NOW,
               abuseError: null,
            },
         })
      })

      it('should keep a history entry of the score, without any secret', async () => {
         mocks.findUniqueProxy.mockResolvedValue(row())
         mocks.check.mockResolvedValue(answer({ abuseScore: 10 }))

         await ProxyScoringService.score('p1')

         expect(mocks.createScore.mock.calls[0][0].data).toEqual({
            proxyServerId: 'p1',
            ip: '203.0.113.9',
            score: 93,
            abuseScore: 10,
            latencyMs: 500,
            reputationChecked: true,
            detail: DETAIL,
            status: 'ACTIVE',
         })
      })

      it('should keep the reasons on the proxy as well, and clear them when the lookup for a new IP fails', async () => {
         mocks.findUniqueProxy.mockResolvedValue(row())
         mocks.check.mockResolvedValue(answer({ abuseScore: 80 }))

         await ProxyScoringService.score('p1')

         expect(mocks.updateProxy.mock.calls[0][0].data.abuseDetail).toEqual(DETAIL)

         mocks.findUniqueProxy.mockResolvedValue(row({ abuseIp: '198.51.100.1' }))
         mocks.check.mockRejectedValue(new mocks.AbuseIpDbError('UNAVAILABLE'))

         await ProxyScoringService.score('p1')

         expect(mocks.updateProxy.mock.calls[1][0].data.abuseDetail).toBe(Prisma.DbNull)
      })

      it('should save no detail in the history when the reputation was not checked', async () => {
         mocks.findUniqueProxy.mockResolvedValue(row())
         mocks.check.mockRejectedValue(new mocks.AbuseIpDbError('UNAVAILABLE'))

         await ProxyScoringService.score('p1')

         expect(mocks.createScore.mock.calls[0][0].data).toMatchObject({
            reputationChecked: false,
            detail: Prisma.DbNull,
         })
      })

      it('should delete history older than 30 days', async () => {
         mocks.findUniqueProxy.mockResolvedValue(row())
         mocks.check.mockResolvedValue(answer())

         await ProxyScoringService.score('p1')

         expect(mocks.deleteManyScore.mock.calls[0][0].where.scoredAt.lt).toEqual(
            new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
         )
      })

      it('should reuse an answer for the same IP checked in the last 24 hours, without calling the API', async () => {
         mocks.findUniqueProxy.mockResolvedValue(row())
         mocks.findFirstProxy.mockResolvedValue({
            abuseIp: '203.0.113.9',
            abuseScore: 20,
            abuseReports: 2,
            abuseLastReportedAt: null,
            abuseUsageType: null,
            abuseIsp: null,
            abuseIsTor: false,
            abuseDetail: DETAIL,
            abuseCheckedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
         })

         await expect(ProxyScoringService.score('p1')).resolves.toEqual({
            stop: false,
            remaining: null,
         })

         expect(mocks.check).not.toHaveBeenCalled()
         expect(mocks.findFirstProxy.mock.calls[0][0].where).toMatchObject({
            abuseIp: '203.0.113.9',
            abuseScore: { not: null },
            abuseDetail: { not: Prisma.DbNull },
            abuseError: null,
            abuseCheckedAt: { gte: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) },
         })
         expect(mocks.updateProxy.mock.calls[0][0].data).toMatchObject({
            score: 86,
            abuseScore: 20,
            scoreHasReputation: true,
            abuseDetail: DETAIL,
         })
      })

      it('should score on speed alone, capped below good, when no key is set, and not call the API', async () => {
         mocks.isConfigured.mockReturnValue(false)
         mocks.findUniqueProxy.mockResolvedValue(row())

         await ProxyScoringService.score('p1')

         expect(mocks.check).not.toHaveBeenCalled()
         expect(mocks.updateProxy.mock.calls[0][0].data).toMatchObject({
            score: 89,
            scoreHasReputation: false,
         })
         expect(mocks.updateProxy.mock.calls[0][0].data.abuseError).toBeUndefined()
      })

      it('should score on speed alone and record a fixed reason when the lookup fails', async () => {
         mocks.findUniqueProxy.mockResolvedValue(
            row({
               abuseIp: '203.0.113.9',
               abuseScore: 5,
            })
         )
         mocks.check.mockRejectedValue(new mocks.AbuseIpDbError('UNAVAILABLE'))

         await expect(ProxyScoringService.score('p1')).resolves.toEqual({
            stop: false,
            remaining: null,
         })

         const [[{ data }]] = mocks.updateProxy.mock.calls

         expect(data).toMatchObject({
            score: 89,
            scoreHasReputation: false,
            abuseError: 'abuse UNAVAILABLE',
         })
         expect(data.abuseScore).toBeUndefined()
      })

      it('should drop the answer of an older IP when the lookup for the new one fails', async () => {
         mocks.findUniqueProxy.mockResolvedValue(
            row({
               abuseIp: '198.51.100.1',
               abuseScore: 5,
            })
         )
         mocks.check.mockRejectedValue(new mocks.AbuseIpDbError('UNAVAILABLE'))

         await ProxyScoringService.score('p1')

         expect(mocks.updateProxy.mock.calls[0][0].data).toMatchObject({
            abuseIp: null,
            abuseScore: null,
            abuseReports: null,
            abuseCheckedAt: null,
         })
      })

      it.each([
         ['RATE_LIMITED', 7200],
         ['AUTH', undefined],
         ['PLAN', undefined],
      ])('should tell the caller to stop after %s', async (kind, retryAfterSeconds) => {
         mocks.findUniqueProxy.mockResolvedValue(row())
         mocks.check.mockRejectedValue(new mocks.AbuseIpDbError(kind, retryAfterSeconds))

         await expect(ProxyScoringService.score('p1')).resolves.toMatchObject({
            stop: true,
            retryAfterSeconds,
         })
      })

      it('should report when no checks are left today', async () => {
         mocks.findUniqueProxy.mockResolvedValue(row())
         mocks.check.mockResolvedValue(answer({ remaining: 0 }))

         await expect(ProxyScoringService.score('p1')).resolves.toMatchObject({ remaining: 0 })
      })

      it.each([
         ['an unreachable proxy', { status: 'UNREACHABLE' }],
         ['a paused proxy', { status: 'DISABLED' }],
         ['a proxy with no exit IP', { detectedIp: null }],
         ['a proxy with no latency', { latencyMs: null }],
      ])('should clear the score of %s and not call the API', async (_name, extra) => {
         mocks.findUniqueProxy.mockResolvedValue(row(extra))

         await ProxyScoringService.score('p1')

         expect(mocks.check).not.toHaveBeenCalled()
         expect(mocks.createScore).not.toHaveBeenCalled()
         expect(mocks.updateProxy.mock.calls[0][0].data).toEqual({
            score: null,
            scoredAt: NOW,
            scoreHasReputation: null,
         })
      })

      it('should not send anything but the IP to AbuseIPDB', async () => {
         mocks.findUniqueProxy.mockResolvedValue(row())
         mocks.check.mockResolvedValue(answer())

         await ProxyScoringService.score('p1')

         expect(mocks.check).toHaveBeenCalledTimes(1)
         expect(mocks.check.mock.calls[0]).toEqual(['203.0.113.9'])
      })
   })

   describe('scoreSoon', () => {
      it('should never throw, and only log, when scoring fails', async () => {
         mocks.findUniqueProxy.mockRejectedValue(new Error('database down'))

         expect(() => ProxyScoringService.scoreSoon('p1')).not.toThrow()
         await vi.waitFor(() => expect(console.error).toHaveBeenCalled())
      })
   })

   describe('findDue', () => {
      it('should find proxies not scored since the start of today (UTC) as daily, and retried lookups as lookup-only', async () => {
         mocks.findManyProxy.mockResolvedValue([
            {
               id: 'a',
               linkedInAccountId: 'acc1',
               linkedInAccount: { userId: 'u1' },
               status: 'ACTIVE',
               scoredAt: null,
               abuseError: null,
            },
            {
               id: 'b',
               linkedInAccountId: 'acc1',
               linkedInAccount: { userId: 'u1' },
               status: 'UNREACHABLE',
               scoredAt: new Date('2026-10-13T23:00:00Z'),
               abuseError: null,
            },
            {
               id: 'c',
               linkedInAccountId: 'acc2',
               linkedInAccount: { userId: 'u2' },
               status: 'ACTIVE',
               scoredAt: new Date('2026-10-14T08:00:00Z'),
               abuseError: 'abuse UNAVAILABLE',
            },
         ])

         const due = await ProxyScoringService.findDue(NOW, 200)
         const [[{ where, take }]] = mocks.findManyProxy.mock.calls

         expect(take).toBe(200)
         expect(where.status).toEqual({ not: 'DISABLED' })
         expect(where.OR).toEqual(
            expect.arrayContaining([
               { scoredAt: null },
               { scoredAt: { lt: new Date('2026-10-14T00:00:00Z') } },
               {
                  abuseError: { not: null },
                  scoredAt: { lt: new Date('2026-10-14T09:30:00Z') },
               },
            ])
         )
         expect(due).toEqual([
            {
               id: 'a',
               accountId: 'acc1',
               userId: 'u1',
               status: 'ACTIVE',
               scoredAt: null,
               retest: true,
            },
            {
               id: 'b',
               accountId: 'acc1',
               userId: 'u1',
               status: 'UNREACHABLE',
               scoredAt: new Date('2026-10-13T23:00:00Z'),
               retest: true,
            },
            {
               id: 'c',
               accountId: 'acc2',
               userId: 'u2',
               status: 'ACTIVE',
               scoredAt: new Date('2026-10-14T08:00:00Z'),
               retest: false,
            },
         ])
      })

      it('should not look for failed lookups to retry when there is no key', async () => {
         mocks.isConfigured.mockReturnValue(false)
         mocks.findManyProxy.mockResolvedValue([])

         await ProxyScoringService.findDue(NOW, 200)

         expect(mocks.findManyProxy.mock.calls[0][0].where.OR).toHaveLength(2)
      })
   })

   describe('claim', () => {
      it('should take a proxy only if nobody scored it since it was found', async () => {
         const found = new Date('2026-10-13T08:00:00Z')

         mocks.updateManyProxy.mockResolvedValue({ count: 1 })

         await expect(ProxyScoringService.claim('p1', found)).resolves.toBe(true)
         expect(mocks.updateManyProxy.mock.calls[0][0]).toEqual({
            where: {
               id: 'p1',
               scoredAt: found,
            },
            data: { scoredAt: NOW },
         })
      })

      it('should lose the claim when another run took it first', async () => {
         mocks.updateManyProxy.mockResolvedValue({ count: 0 })

         await expect(ProxyScoringService.claim('p1', null)).resolves.toBe(false)
      })
   })
})
