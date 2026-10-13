import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AbuseIpDbError, AbuseIpDbService } from './abuseIpDb.service'

const mocks = vi.hoisted(() => ({ key: 'secret-abuse-key' }))

vi.mock('env', () => ({
   get ABUSEIPDB_API_KEY() {
      return mocks.key
   },
}))

const answer = (data: Record<string, unknown>) => ({
   data: {
      ipAddress: '203.0.113.9',
      isPublic: true,
      abuseConfidenceScore: 12,
      usageType: 'Fixed Line ISP',
      isp: 'Example ISP',
      isTor: false,
      totalReports: 3,
      lastReportedAt: '2026-10-01T10:00:00+00:00',
      ...data,
   },
})

const respond = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
   new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: init.headers,
   })

const fetchMock = vi.fn()

describe('AbuseIpDbService', () => {
   beforeEach(() => {
      mocks.key = 'secret-abuse-key'
      fetchMock.mockReset()
      vi.stubGlobal('fetch', fetchMock)
   })

   afterEach(() => {
      vi.unstubAllGlobals()
   })

   describe('isConfigured', () => {
      it('should be true only when a key is set', () => {
         expect(AbuseIpDbService.isConfigured()).toBe(true)

         mocks.key = ''

         expect(AbuseIpDbService.isConfigured()).toBe(false)
      })
   })

   describe('check', () => {
      it('should ask the check endpoint with the key in a header, never in the URL', async () => {
         fetchMock.mockResolvedValue(respond(answer({})))

         await AbuseIpDbService.check('203.0.113.9')

         const [[url, options]] = fetchMock.mock.calls

         expect(String(url)).toContain('https://api.abuseipdb.com/api/v2/check?')
         expect(String(url)).toContain('maxAgeInDays=90')
         expect(String(url)).toContain('verbose')
         expect(String(url)).not.toContain('secret-abuse-key')
         expect(options.headers).toMatchObject({
            Key: 'secret-abuse-key',
            Accept: 'application/json',
         })
      })

      it('should URL-encode an IPv6 address', async () => {
         fetchMock.mockResolvedValue(respond(answer({ ipAddress: '2001:db8::1' })))

         await AbuseIpDbService.check('2001:db8::1')

         expect(String(fetchMock.mock.calls[0][0])).toContain('ipAddress=2001%3Adb8%3A%3A1')
      })

      it('should return the reputation and the requests left today', async () => {
         fetchMock.mockResolvedValue(respond(answer({}), { headers: { 'X-RateLimit-Remaining': '998' } }))

         await expect(AbuseIpDbService.check('203.0.113.9')).resolves.toMatchObject({
            abuseScore: 12,
            totalReports: 3,
            lastReportedAt: new Date('2026-10-01T10:00:00+00:00'),
            usageType: 'Fixed Line ISP',
            isp: 'Example ISP',
            isTor: false,
            remaining: 998,
         })
      })

      describe('detail', () => {
         const report = (reportedAt: string, categories: number[], extra: Record<string, unknown> = {}) => ({
            reportedAt,
            comment: 'Oct 1 sshd: Invalid user bob from 203.0.113.9 (private log line)',
            categories,
            reporterId: 77,
            reporterCountryCode: 'DE',
            reporterCountryName: 'Germany',
            ...extra,
         })

         it('should count the reasons across the reports, most reported first, with their names', async () => {
            fetchMock.mockResolvedValue(
               respond(
                  answer({
                     numDistinctUsers: 2,
                     isWhitelisted: false,
                     domain: 'example.net',
                     countryCode: 'NL',
                     hostnames: ['a.example.net'],
                     reports: [
                        report('2026-10-03T10:00:00+00:00', [14, 18]),
                        report('2026-10-02T10:00:00+00:00', [18]),
                        report('2026-10-01T10:00:00+00:00', [18, 999]),
                     ],
                  })
               )
            )

            const { detail } = await AbuseIpDbService.check('203.0.113.9')

            expect(detail).toMatchObject({
               maxAgeInDays: 90,
               numDistinctUsers: 2,
               isWhitelisted: false,
               domain: 'example.net',
               countryCode: 'NL',
               hostnames: ['a.example.net'],
            })
            expect(detail.categories).toEqual([
               {
                  id: 18,
                  name: 'Brute-Force',
                  reports: 3,
               },
               {
                  id: 14,
                  name: 'Port Scan',
                  reports: 1,
               },
               {
                  id: 999,
                  name: 'Category 999',
                  reports: 1,
               },
            ])
         })

         it('should keep the 10 newest reports as date, reasons and reporter country, and never the comment or id', async () => {
            const reports = Array.from({ length: 12 }, (_value, index) =>
               report(`2026-10-${String(index + 1).padStart(2, '0')}T10:00:00+00:00`, [14])
            )

            fetchMock.mockResolvedValue(respond(answer({ reports })))

            const { detail } = await AbuseIpDbService.check('203.0.113.9')

            expect(detail.recent).toHaveLength(10)
            expect(detail.recent[0]).toEqual({
               reportedAt: '2026-10-12T10:00:00+00:00',
               categories: ['Port Scan'],
               reporterCountryCode: 'DE',
            })
            expect(JSON.stringify(detail)).not.toContain('private log line')
            expect(JSON.stringify(detail)).not.toContain('77')
         })

         it('should have empty lists and no facts for an IP with no reports', async () => {
            fetchMock.mockResolvedValue(respond(answer({})))

            const { detail } = await AbuseIpDbService.check('203.0.113.9')

            expect(detail).toEqual({
               maxAgeInDays: 90,
               numDistinctUsers: null,
               isWhitelisted: null,
               domain: null,
               countryCode: null,
               hostnames: [],
               categories: [],
               recent: [],
            })
         })

         it('should keep at most 5 host names', async () => {
            fetchMock.mockResolvedValue(respond(answer({ hostnames: ['1', '2', '3', '4', '5', '6', '7'] })))

            const { detail } = await AbuseIpDbService.check('203.0.113.9')

            expect(detail.hostnames).toHaveLength(5)
         })
      })

      it('should accept an IP with no reports and no usage details', async () => {
         fetchMock.mockResolvedValue(
            respond(
               answer({
                  lastReportedAt: null,
                  usageType: null,
                  isp: null,
                  totalReports: 0,
                  abuseConfidenceScore: 0,
               })
            )
         )

         await expect(AbuseIpDbService.check('203.0.113.9')).resolves.toMatchObject({
            abuseScore: 0,
            lastReportedAt: null,
            usageType: null,
            isp: null,
            remaining: null,
         })
      })

      it('should report a rate limit with how long to wait', async () => {
         fetchMock.mockResolvedValue(
            respond(
               { errors: [{ detail: 'Daily rate limit' }] },
               {
                  status: 429,
                  headers: { 'Retry-After': '3600' },
               }
            )
         )

         await expect(AbuseIpDbService.check('203.0.113.9')).rejects.toMatchObject({
            kind: 'RATE_LIMITED',
            retryAfterSeconds: 3600,
         })
      })

      it.each([
         [401, 'AUTH'],
         [403, 'AUTH'],
         [402, 'PLAN'],
         [500, 'UNAVAILABLE'],
         [422, 'UNAVAILABLE'],
      ])('should map HTTP %i to %s', async (status, kind) => {
         fetchMock.mockResolvedValue(respond({ errors: [{ detail: 'nope' }] }, { status }))

         await expect(AbuseIpDbService.check('203.0.113.9')).rejects.toMatchObject({ kind })
      })

      it('should report an answer it cannot read', async () => {
         fetchMock.mockResolvedValue(respond('<html>not json</html>'))

         await expect(AbuseIpDbService.check('203.0.113.9')).rejects.toMatchObject({ kind: 'BAD_RESPONSE' })

         fetchMock.mockResolvedValue(respond({ data: { abuseConfidenceScore: 'high' } }))

         await expect(AbuseIpDbService.check('203.0.113.9')).rejects.toMatchObject({ kind: 'BAD_RESPONSE' })
      })

      it('should report a network failure as unavailable', async () => {
         fetchMock.mockRejectedValue(new TypeError('fetch failed'))

         await expect(AbuseIpDbService.check('203.0.113.9')).rejects.toMatchObject({ kind: 'UNAVAILABLE' })
      })

      it('should never put the key or the response body in an error message', async () => {
         fetchMock.mockResolvedValue(respond({ errors: [{ detail: 'secret-abuse-key leaked' }] }, { status: 401 }))

         const error = await AbuseIpDbService.check('203.0.113.9').catch((reason: unknown) => reason)

         expect(error).toBeInstanceOf(AbuseIpDbError)
         expect((error as Error).message).not.toContain('secret-abuse-key')
         expect((error as Error).message).not.toContain('leaked')
      })

      it('should refuse to run without a key', async () => {
         mocks.key = ''

         await expect(AbuseIpDbService.check('203.0.113.9')).rejects.toMatchObject({ kind: 'AUTH' })
         expect(fetchMock).not.toHaveBeenCalled()
      })
   })
})
