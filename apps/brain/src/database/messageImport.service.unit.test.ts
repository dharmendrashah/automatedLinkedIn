import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MessageImportService } from './messageImport.service'

const mocks = vi.hoisted(() => ({
   queryRaw: vi.fn(),
   findSession: vi.fn(),
   updateMany: vi.fn(),
   store: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         $queryRawUnsafe: mocks.queryRaw,
         spiderSession: { findUnique: mocks.findSession },
         messageImport: { updateMany: mocks.updateMany },
      },
   },
}))

vi.mock('./linkedInConversation.service', () => ({ LinkedInConversationService: { store: mocks.store } }))

vi.mock('core', () => ({ MessageFiles: { read: vi.fn() } }))

const part = (conversations = 1) =>
   JSON.stringify({
      contract: 1,
      part: 1,
      captured_at: '2026-10-22T12:00:00.000Z',
      conversations: Array.from({ length: conversations }, (_, index) => ({
         id: `2-${index}`,
         title: 'Ada',
         kind: 'DIRECT',
         participants: [{ name: 'Ada' }],
         unread: false,
         lastActivity: 'Oct 22',
         complete: true,
         messages: [],
      })),
   })

const session = (names: string[]) => ({
   userId: 'u1',
   linkedInAccountId: 'acc1',
   artifacts: names.map(name => ({
      name,
      path: `runs/linkedin-messages/u1/2026/10/22/s1/${name}`,
      kind: 'file',
   })),
})

describe('MessageImportService.run', () => {
   beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-22T12:00:00Z') })
      vi.resetAllMocks()
      mocks.store.mockResolvedValue({
         conversations: 1,
         messages: 2,
      })
   })

   afterEach(() => vi.useRealTimers())

   it('should store the parts of a run in their order, for the session owner, and finish the import', async () => {
      const read = vi.fn(async (_path: string) => part())

      mocks.findSession.mockResolvedValue(session(['messages-2.json', 'notes.txt', 'messages.json']))

      await expect(MessageImportService.run('s1', 0, read)).resolves.toBe('done')

      expect(read.mock.calls.map(([path]) => path.split('/').at(-1))).toEqual(['messages.json', 'messages-2.json'])
      expect(mocks.store).toHaveBeenCalledTimes(2)
      expect(mocks.store).toHaveBeenCalledWith(
         {
            userId: 'u1',
            accountId: 'acc1',
         },
         expect.objectContaining({ part: 1 })
      )
      expect(mocks.updateMany).toHaveBeenCalledWith({
         where: { sessionId: 's1' },
         data: expect.objectContaining({
            status: 'DONE',
            claimedUntil: null,
            lastError: null,
         }),
      })
   })

   it('should finish a run that has no messages file without reading anything', async () => {
      const read = vi.fn()

      mocks.findSession.mockResolvedValue(session([]))

      await expect(MessageImportService.run('s1', 0, read)).resolves.toBe('done')
      expect(read).not.toHaveBeenCalled()
   })

   it('should try again later when a file cannot be read, and say only the kind of failure', async () => {
      mocks.findSession.mockResolvedValue(session(['messages.json']))

      await expect(
         MessageImportService.run('s1', 0, async () => {
            throw new Error('secret text of a message')
         })
      ).resolves.toBe('retry')

      const [[{ data }]] = mocks.updateMany.mock.calls

      expect(data).toMatchObject({
         status: 'PENDING',
         attempts: 1,
         claimedUntil: null,
         lastError: 'Error',
      })
      expect(JSON.stringify(data)).not.toContain('secret text')
      expect(data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
   })

   it('should refuse a file that is not of the contract, and give up after the last attempt', async () => {
      mocks.findSession.mockResolvedValue(session(['messages.json']))

      await expect(MessageImportService.run('s1', 4, async () => '{"conversations":"no"}')).resolves.toBe('failed')
      expect(mocks.updateMany.mock.calls[0]?.[0].data).toMatchObject({
         status: 'FAILED',
         attempts: 5,
      })
      expect(mocks.store).not.toHaveBeenCalled()
   })

   it('should end an import whose session is gone', async () => {
      mocks.findSession.mockResolvedValue(null)

      await expect(MessageImportService.run('s1', 0, vi.fn())).resolves.toBe('failed')
   })
})

describe('MessageImportService.importDue', () => {
   beforeEach(() => vi.resetAllMocks())

   it('should do nothing when no import is due', async () => {
      mocks.queryRaw.mockResolvedValue([])

      await expect(MessageImportService.importDue()).resolves.toEqual({
         done: 0,
         retried: 0,
         failed: 0,
      })
   })

   it('should stop at once when the signal is aborted', async () => {
      mocks.queryRaw.mockResolvedValue([
         {
            sessionId: 's1',
            attempts: 0,
         },
      ])

      const controller = new AbortController()

      controller.abort()

      await expect(MessageImportService.importDue(controller.signal)).resolves.toEqual({
         done: 0,
         retried: 0,
         failed: 0,
      })
      expect(mocks.findSession).not.toHaveBeenCalled()
   })
})
