import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
   SESSION_FILE_PATTERN,
   SpiderRecordingUnavailableError,
   SpiderSensitiveFileError,
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
   transaction: vi.fn(),
   createArtifacts: vi.fn(),
   findArtifact: vi.fn(),
}))

vi.mock('env', () => ({ SESSION_RECORDING_RETENTION_DAYS: 7 }))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         $transaction: mocks.transaction,
         spiderSessionArtifact: {
            createMany: mocks.createArtifacts,
            findFirst: mocks.findArtifact,
         },
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
      mocks.transaction.mockImplementation(async (work: (tx: unknown) => unknown) =>
         work({
            spiderSession: { updateMany: mocks.updateMany },
            spiderSessionArtifact: { createMany: mocks.createArtifacts },
         })
      )
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

   describe('fail with a verdict', () => {
      it('should record the verdict of a task that could not be queued', async () => {
         mocks.updateMany.mockResolvedValue({ count: 1 })

         await SpiderSessionService.fail('s1', 'Could not be queued.', 'NOT_QUEUED')

         expect(mocks.updateMany.mock.calls[0][0].data).toMatchObject({
            status: 'FAILED',
            outcome: 'ERROR',
            verdict: 'NOT_QUEUED',
         })
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

   describe('startTask', () => {
      const input = {
         id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
         userId: 'u1',
         linkedInAccountId: 'acc1',
         task: 'browser-detection',
         taskVersion: 1,
         trigger: 'automatic' as const,
         input: { word: 'hello' },
         startedAt: new Date('2026-10-13T10:00:00.000Z'),
         proxy: {
            id: 'p1',
            protocol: 'HTTP' as const,
            host: 'proxy.example.net',
            port: 8080,
            country: 'Canada',
         },
      }

      it('should note a task session in progress, with the proxy as a snapshot and what it was given, without secrets', async () => {
         mocks.create.mockResolvedValue({})
         mocks.deleteMany.mockResolvedValue({ count: 0 })

         await SpiderSessionService.startTask(input)

         expect(mocks.create).toHaveBeenCalledWith({
            data: {
               id: input.id,
               userId: 'u1',
               linkedInAccountId: 'acc1',
               kind: 'TASK',
               task: 'browser-detection',
               taskVersion: 1,
               trigger: 'automatic',
               startedAt: input.startedAt,
               proxyServerId: 'p1',
               proxyProtocol: 'HTTP',
               proxyHost: 'proxy.example.net',
               proxyPort: 8080,
               proxyCountry: 'Canada',
               requestParams: {
                  action: 'TASK',
                  task: 'browser-detection',
                  taskVersion: 1,
                  trigger: 'automatic',
                  input: { word: 'hello' },
                  proxy: 'http://proxy.example.net:8080',
               },
            },
         })
      })

      it('should note a task that runs without a proxy, and the session it retries', async () => {
         mocks.create.mockResolvedValue({})
         mocks.deleteMany.mockResolvedValue({ count: 0 })

         await SpiderSessionService.startTask({
            ...input,
            proxy: undefined,
            retryOfId: 'old',
         })

         expect(mocks.create.mock.calls[0][0].data).toMatchObject({
            retryOfId: 'old',
            requestParams: { proxy: null },
         })
         expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty('proxyServerId')
      })

      it('should throw when the session cannot be saved, so a task is never queued without one', async () => {
         mocks.create.mockRejectedValue(new Error('database down'))

         await expect(SpiderSessionService.startTask(input)).rejects.toThrow('database down')
      })
   })

   describe('finishTask', () => {
      const TASK_ID = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'
      const startedAt = new Date('2026-10-13T10:00:00.000Z')
      const folder = `runs/browser-detection/u1/2026/10/13/${TASK_ID}`
      const result = {
         contract: 1 as const,
         task_id: TASK_ID,
         task: 'browser-detection',
         task_version: 1,
         status: 'SUCCEEDED' as const,
         verdict: 'NOT_DETECTED',
         message: 'Every detection page took this browser for a person.',
         report: {
            headline: 'Not detected',
            sections: [],
         },
         artifacts: [
            {
               kind: 'video' as const,
               name: 'video.webm',
               path: `${folder}/video.webm`,
               content_type: 'video/webm',
               bytes: 100,
            },
            {
               kind: 'session' as const,
               name: 'session.json',
               path: `${folder}/session.json`,
               content_type: 'application/json',
               bytes: 10,
               sensitive: true,
            },
         ],
         artifacts_truncated: false,
         worker: { build: 'abc1234' },
         started_at: '2026-10-13T10:00:00.000Z',
         finished_at: '2026-10-13T10:01:00.000Z',
      }
      const stored = {
         id: TASK_ID,
         userId: 'u1',
         linkedInAccountId: 'acc1',
         task: 'browser-detection',
         startedAt,
      }

      it('should record the verdict, the report and the worker, then the files of the run, once, in one transaction', async () => {
         mocks.findFirst.mockResolvedValue(stored)
         mocks.updateMany.mockResolvedValue({ count: 1 })

         await expect(SpiderSessionService.finishTask(result)).resolves.toEqual({
            id: TASK_ID,
            userId: 'u1',
            linkedInAccountId: 'acc1',
         })

         expect(mocks.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  id: TASK_ID,
                  kind: 'TASK',
                  status: 'IN_PROGRESS',
               },
            })
         )
         expect(mocks.updateMany).toHaveBeenCalledWith({
            where: {
               id: TASK_ID,
               status: 'IN_PROGRESS',
            },
            data: {
               status: 'SUCCEEDED',
               outcome: 'NOT_DETECTED',
               verdict: 'NOT_DETECTED',
               message: result.message,
               report: result.report,
               workerBuild: 'abc1234',
               finishedAt: new Date('2026-10-13T10:01:00.000Z'),
               durationMs: 60_000,
               recordingPrefix: folder,
            },
         })
         expect(mocks.createArtifacts).toHaveBeenCalledWith({
            data: [
               {
                  sessionId: TASK_ID,
                  kind: 'video',
                  name: 'video.webm',
                  path: `${folder}/video.webm`,
                  contentType: 'video/webm',
                  bytes: 100,
                  step: null,
                  sensitive: false,
               },
               {
                  sessionId: TASK_ID,
                  kind: 'session',
                  name: 'session.json',
                  path: `${folder}/session.json`,
                  contentType: 'application/json',
                  bytes: 10,
                  step: null,
                  sensitive: true,
               },
            ],
            skipDuplicates: true,
         })
      })

      it('should end a failed run as failed', async () => {
         mocks.findFirst.mockResolvedValue(stored)
         mocks.updateMany.mockResolvedValue({ count: 1 })

         await SpiderSessionService.finishTask({
            ...result,
            status: 'FAILED',
            verdict: 'DETECTED',
         })

         expect(mocks.updateMany.mock.calls[0][0].data).toMatchObject({
            status: 'FAILED',
            verdict: 'DETECTED',
         })
      })

      it("should never store a file outside the folder it computes for the run, such as another user's", async () => {
         mocks.findFirst.mockResolvedValue(stored)
         mocks.updateMany.mockResolvedValue({ count: 1 })

         await SpiderSessionService.finishTask({
            ...result,
            artifacts: [
               result.artifacts[0],
               {
                  ...result.artifacts[0],
                  name: 'x.png',
                  path: `runs/browser-detection/someone-else/2026/10/13/${TASK_ID}/x.png`,
               },
               {
                  ...result.artifacts[0],
                  name: 'y.png',
                  path: `${folder}/../y.png`,
               },
            ],
         })

         expect(mocks.createArtifacts.mock.calls[0][0].data.map((file: { path: string }) => file.path)).toEqual([
            `${folder}/video.webm`,
         ])
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('2'))
      })

      it('should keep no recording prefix when no file was kept', async () => {
         mocks.findFirst.mockResolvedValue(stored)
         mocks.updateMany.mockResolvedValue({ count: 1 })

         await SpiderSessionService.finishTask({
            ...result,
            artifacts: [],
         })

         expect(mocks.updateMany.mock.calls[0][0].data).not.toHaveProperty('recordingPrefix')
         expect(mocks.createArtifacts).not.toHaveBeenCalled()
      })

      it('should ignore an answer for a session it does not know or that is already done', async () => {
         mocks.findFirst.mockResolvedValue(null)

         await expect(SpiderSessionService.finishTask(result)).resolves.toBeNull()

         mocks.findFirst.mockResolvedValue(stored)
         mocks.updateMany.mockResolvedValue({ count: 0 })

         await expect(SpiderSessionService.finishTask(result)).resolves.toBeNull()
         expect(mocks.createArtifacts).not.toHaveBeenCalled()
      })

      it('should ignore an answer that names a different task than the session', async () => {
         mocks.findFirst.mockResolvedValue({
            ...stored,
            task: 'linkedin-login',
         })

         await expect(SpiderSessionService.finishTask(result)).resolves.toBeNull()
         expect(mocks.updateMany).not.toHaveBeenCalled()
      })
   })

   describe('artifactKey', () => {
      const artifact = (overrides = {}) => ({
         path: 'runs/browser-detection/u1/2026/10/13/s1/video.webm',
         sensitive: false,
         session: { startedAt: new Date() },
         ...overrides,
      })

      it("should only find a file of the user's own session, and return where it lives", async () => {
         mocks.findArtifact.mockResolvedValue(artifact())

         await expect(SpiderSessionService.artifactKey('u1', 's1', 'a1')).resolves.toBe(
            'runs/browser-detection/u1/2026/10/13/s1/video.webm'
         )
         expect(mocks.findArtifact.mock.calls[0][0].where).toEqual({
            id: 'a1',
            sessionId: 's1',
            session: { userId: 'u1' },
         })
      })

      it('should not reveal a file of someone else', async () => {
         mocks.findArtifact.mockResolvedValue(null)

         await expect(SpiderSessionService.artifactKey('u1', 's1', 'a1')).rejects.toBeInstanceOf(
            SpiderSessionNotFoundError
         )
      })

      it('should keep a file with login tokens back until the owner asks for it', async () => {
         mocks.findArtifact.mockResolvedValue(artifact({ sensitive: true }))

         await expect(SpiderSessionService.artifactKey('u1', 's1', 'a1')).rejects.toBeInstanceOf(
            SpiderSensitiveFileError
         )
         await expect(SpiderSessionService.artifactKey('u1', 's1', 'a1', true)).resolves.toContain('video.webm')
      })

      it('should say so when the files have expired', async () => {
         mocks.findArtifact.mockResolvedValue(artifact({ session: { startedAt: new Date(Date.now() - 8 * DAY_MS) } }))

         await expect(SpiderSessionService.artifactKey('u1', 's1', 'a1')).rejects.toBeInstanceOf(
            SpiderRecordingUnavailableError
         )
      })
   })

   describe('SESSION_FILE_PATTERN', () => {
      it.each([
         'video.webm',
         'timeline.json',
         'network.json',
         'logs.json',
         'failure.html',
         'screenshots/01-goto.png',
         'screenshots/04-fullpage-pixelscan.png',
      ])('should accept %s', file => {
         expect(SESSION_FILE_PATTERN.test(file)).toBe(true)
      })
   })
})
