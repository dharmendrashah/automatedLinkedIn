import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
   SESSION_FILE_PATTERN,
   SpiderRecordingUnavailableError,
   SpiderSessionNotFoundError,
   SpiderSessionService,
} from './spiderSession.service'

const mocks = vi.hoisted(() => ({
   create: vi.fn(),
   updateMany: vi.fn(),
   findUnique: vi.fn(),
   findFirst: vi.fn(),
   findMany: vi.fn(),
   deleteMany: vi.fn(),
}))

vi.mock('env', () => ({ SESSION_RECORDING_RETENTION_DAYS: 7 }))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         spiderSession: {
            create: mocks.create,
            updateMany: mocks.updateMany,
            findUnique: mocks.findUnique,
            findFirst: mocks.findFirst,
            findMany: mocks.findMany,
            deleteMany: mocks.deleteMany,
         },
      },
   },
}))

const DAY_MS = 24 * 60 * 60 * 1000
const PREFIX = 'recordings/validate/0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11/20261012T100005Z'

describe('SpiderSessionService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   describe('start', () => {
      const input = {
         id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
         userId: 'u1',
         linkedInAccountId: 'acc1',
         email: 'ada@work.com',
         proxy: {
            id: 'p1',
            protocol: 'SOCKS5' as const,
            host: 'proxy.example.net',
            port: 1080,
            country: 'Canada',
         },
      }

      it('should note a session in progress with the proxy as a snapshot and what the run was given, without secrets', async () => {
         mocks.create.mockResolvedValue({})
         mocks.deleteMany.mockResolvedValue({ count: 0 })

         await SpiderSessionService.start({
            ...input,
            retryOfId: 'old',
         })

         expect(mocks.create).toHaveBeenCalledWith({
            data: {
               id: input.id,
               userId: 'u1',
               linkedInAccountId: 'acc1',
               kind: 'VALIDATE_ACCOUNT',
               proxyServerId: 'p1',
               proxyProtocol: 'SOCKS5',
               proxyHost: 'proxy.example.net',
               proxyPort: 1080,
               proxyCountry: 'Canada',
               requestParams: {
                  action: 'VALIDATE_ACCOUNT',
                  email: 'ada@work.com',
                  proxy: 'socks5://proxy.example.net:1080',
               },
               retryOfId: 'old',
            },
         })
      })

      it('should delete sessions older than 30 days when it saves a new one', async () => {
         mocks.create.mockResolvedValue({})
         mocks.deleteMany.mockResolvedValue({ count: 0 })

         await SpiderSessionService.start(input)

         const cutoff = mocks.deleteMany.mock.calls[0][0].where.startedAt.lt as Date

         expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(30 * DAY_MS - 1000)
         expect(Date.now() - cutoff.getTime()).toBeLessThan(30 * DAY_MS + 1000)
      })

      it('should never fail the check when the session cannot be saved', async () => {
         mocks.create.mockRejectedValue(new Error('database down'))

         await expect(SpiderSessionService.start(input)).resolves.toBeUndefined()
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('database down'))
      })
   })

   describe('fail', () => {
      it('should end a session that is still in progress as failed with the reason', async () => {
         mocks.updateMany.mockResolvedValue({ count: 1 })

         await SpiderSessionService.fail('s1', 'Could not be queued.')

         expect(mocks.updateMany).toHaveBeenCalledWith({
            where: {
               id: 's1',
               status: 'IN_PROGRESS',
            },
            data: {
               status: 'FAILED',
               outcome: 'ERROR',
               message: 'Could not be queued.',
               finishedAt: expect.any(Date),
            },
         })
      })
   })

   describe('finish', () => {
      const result = {
         validation_id: 's1',
         account_id: 'acc1',
         outcome: 'VALID' as const,
         message: 'Signed in to LinkedIn.',
         checked_at: '2026-10-12T10:00:30.000Z',
         recording_prefix: PREFIX,
      }

      it('should record the verdict, the time it took and where the recording is, once', async () => {
         mocks.findUnique.mockResolvedValue({ startedAt: new Date('2026-10-12T10:00:00.000Z') })
         mocks.updateMany.mockResolvedValue({ count: 1 })

         await expect(SpiderSessionService.finish(result)).resolves.toBe(true)

         expect(mocks.updateMany).toHaveBeenCalledWith({
            where: {
               id: 's1',
               status: 'IN_PROGRESS',
            },
            data: {
               status: 'SUCCEEDED',
               outcome: 'VALID',
               message: 'Signed in to LinkedIn.',
               finishedAt: new Date('2026-10-12T10:00:30.000Z'),
               durationMs: 30_000,
               recordingPrefix: PREFIX,
            },
         })
      })

      it.each(['INVALID_CREDENTIALS', 'NEEDS_REAUTH', 'ERROR'] as const)(
         'should end a %s verdict as failed',
         async outcome => {
            mocks.findUnique.mockResolvedValue({ startedAt: new Date('2026-10-12T10:00:00.000Z') })
            mocks.updateMany.mockResolvedValue({ count: 1 })

            await SpiderSessionService.finish({
               ...result,
               outcome,
            })

            expect(mocks.updateMany.mock.calls[0][0].data).toMatchObject({
               status: 'FAILED',
               outcome,
            })
         }
      )

      it('should not store a recording prefix when there is none', async () => {
         mocks.findUnique.mockResolvedValue({ startedAt: new Date('2026-10-12T10:00:00.000Z') })
         mocks.updateMany.mockResolvedValue({ count: 1 })

         await SpiderSessionService.finish({
            ...result,
            recording_prefix: undefined,
         })

         expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty('recordingPrefix')
      })

      it('should ignore an answer for a session it does not know, or one that already has its verdict', async () => {
         mocks.findUnique.mockResolvedValue(null)

         await expect(SpiderSessionService.finish(result)).resolves.toBe(false)
         expect(mocks.updateMany).not.toHaveBeenCalled()

         mocks.findUnique.mockResolvedValue({ startedAt: new Date() })
         mocks.updateMany.mockResolvedValue({ count: 0 })

         await expect(SpiderSessionService.finish(result)).resolves.toBe(false)
      })

      it('should not report a negative time when the clocks disagree', async () => {
         mocks.findUnique.mockResolvedValue({ startedAt: new Date('2026-10-12T10:05:00.000Z') })
         mocks.updateMany.mockResolvedValue({ count: 1 })

         await SpiderSessionService.finish(result)

         expect(mocks.updateMany.mock.calls[0][0].data.durationMs).toBe(0)
      })
   })

   describe('listForUser', () => {
      const rows = (count: number) =>
         Array.from({ length: count }, (_, index) => ({
            id: `s${index}`,
            recordingPrefix: index === 0 ? PREFIX : null,
            startedAt: new Date(),
         }))

      it('should only read the sessions of this user, newest first', async () => {
         mocks.findMany.mockResolvedValue([])

         await SpiderSessionService.listForUser('u1', {})

         expect(mocks.findMany.mock.calls[0][0]).toMatchObject({
            where: { userId: 'u1' },
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
         })
      })

      it('should narrow by account and result', async () => {
         mocks.findMany.mockResolvedValue([])

         await SpiderSessionService.listForUser('u1', {
            accountId: 'acc1',
            status: 'FAILED',
         })

         expect(mocks.findMany.mock.calls[0][0].where).toEqual({
            userId: 'u1',
            linkedInAccountId: 'acc1',
            status: 'FAILED',
         })
      })

      it('should return a page of 20 and the cursor for the next one', async () => {
         mocks.findMany.mockResolvedValue(rows(21))

         const page = await SpiderSessionService.listForUser('u1', {})

         expect(mocks.findMany.mock.calls[0][0].take).toBe(21)
         expect(page.items).toHaveLength(20)
         expect(page.nextCursor).toBe('s19')
      })

      it('should have no next cursor on the last page, and start after the cursor it is given', async () => {
         mocks.findMany.mockResolvedValue(rows(3))

         const page = await SpiderSessionService.listForUser('u1', { cursor: 's9' })

         expect(page.nextCursor).toBeUndefined()
         expect(mocks.findMany.mock.calls[0][0]).toMatchObject({
            cursor: { id: 's9' },
            skip: 1,
         })
      })

      it('should say whether a recording exists without handing out its path', async () => {
         mocks.findMany.mockResolvedValue(rows(2))

         const { items } = await SpiderSessionService.listForUser('u1', {})

         expect(items.map(item => item.hasRecording)).toEqual([true, false])
         expect(JSON.stringify(items)).not.toContain('recordings/')
      })

      it('should mark a session that never got an answer', async () => {
         mocks.findMany.mockResolvedValue([
            {
               id: 'old',
               status: 'IN_PROGRESS',
               recordingPrefix: null,
               startedAt: new Date(Date.now() - 31 * 60 * 1000),
            },
            {
               id: 'new',
               status: 'IN_PROGRESS',
               recordingPrefix: null,
               startedAt: new Date(),
            },
         ])

         const { items } = await SpiderSessionService.listForUser('u1', {})

         expect(items.map(item => item.noAnswer)).toEqual([true, false])
      })
   })

   describe('getForUser', () => {
      const stored = (overrides = {}) => ({
         id: 's1',
         status: 'FAILED',
         recordingPrefix: PREFIX,
         startedAt: new Date(),
         ...overrides,
      })

      it('should only find the session when it is the user own', async () => {
         mocks.findFirst.mockResolvedValue(stored())

         await SpiderSessionService.getForUser('u1', 's1')

         expect(mocks.findFirst.mock.calls[0][0].where).toEqual({
            id: 's1',
            userId: 'u1',
         })
      })

      it('should not reveal a session that belongs to someone else', async () => {
         mocks.findFirst.mockResolvedValue(null)

         await expect(SpiderSessionService.getForUser('u1', 's1')).rejects.toBeInstanceOf(SpiderSessionNotFoundError)
      })

      it('should say when the recording expires and whether it already has', async () => {
         mocks.findFirst.mockResolvedValue(stored({ startedAt: new Date(Date.now() - DAY_MS) }))

         const fresh = await SpiderSessionService.getForUser('u1', 's1')

         expect(fresh.hasRecording).toBe(true)
         expect(fresh.recordingExpired).toBe(false)
         expect(fresh.recordingExpiresAt.getTime()).toBeGreaterThan(Date.now() + 5 * DAY_MS)

         mocks.findFirst.mockResolvedValue(stored({ startedAt: new Date(Date.now() - 8 * DAY_MS) }))

         expect((await SpiderSessionService.getForUser('u1', 's1')).recordingExpired).toBe(true)
      })

      it('should not hand out the bucket path', async () => {
         mocks.findFirst.mockResolvedValue(stored())

         expect(JSON.stringify(await SpiderSessionService.getForUser('u1', 's1'))).not.toContain('recordings/')
      })
   })

   describe('fileKey', () => {
      const stored = (overrides = {}) => ({
         recordingPrefix: PREFIX,
         startedAt: new Date(),
         ...overrides,
      })

      it('should turn a known file of the user own session into its place in the bucket', async () => {
         mocks.findFirst.mockResolvedValue(stored())

         await expect(SpiderSessionService.fileKey('u1', 's1', 'video.webm')).resolves.toBe(`${PREFIX}/video.webm`)
         await expect(SpiderSessionService.fileKey('u1', 's1', 'screenshots/03-click-failed.png')).resolves.toBe(
            `${PREFIX}/screenshots/03-click-failed.png`
         )
         expect(mocks.findFirst.mock.calls[0][0].where).toEqual({
            id: 's1',
            userId: 'u1',
         })
      })

      it.each([
         '../other/video.webm',
         'screenshots/../../x.json',
         '/etc/passwd',
         'video.webm/../../x',
         'results/validate/x.json',
         'screenshots/x.png',
         'network.json?x=1',
         '',
      ])('should refuse the file name %j', async file => {
         mocks.findFirst.mockResolvedValue(stored())

         await expect(SpiderSessionService.fileKey('u1', 's1', file)).rejects.toBeInstanceOf(SpiderSessionNotFoundError)
      })

      it('should refuse a session of someone else', async () => {
         mocks.findFirst.mockResolvedValue(null)

         await expect(SpiderSessionService.fileKey('u1', 's1', 'video.webm')).rejects.toBeInstanceOf(
            SpiderSessionNotFoundError
         )
      })

      it('should say so when there is no recording, or it has expired', async () => {
         mocks.findFirst.mockResolvedValue(stored({ recordingPrefix: null }))

         await expect(SpiderSessionService.fileKey('u1', 's1', 'video.webm')).rejects.toBeInstanceOf(
            SpiderRecordingUnavailableError
         )

         mocks.findFirst.mockResolvedValue(stored({ startedAt: new Date(Date.now() - 8 * DAY_MS) }))

         await expect(SpiderSessionService.fileKey('u1', 's1', 'video.webm')).rejects.toBeInstanceOf(
            SpiderRecordingUnavailableError
         )
      })
   })

   describe('SESSION_FILE_PATTERN', () => {
      it.each(['video.webm', 'timeline.json', 'network.json', 'logs.json', 'failure.html', 'screenshots/01-goto.png'])(
         'should accept %s',
         file => {
            expect(SESSION_FILE_PATTERN.test(file)).toBe(true)
         }
      )
   })
})
