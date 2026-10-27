import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConnectionImportService } from './connectionImport.service'

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
         connectionImport: { updateMany: mocks.updateMany },
      },
   },
}))

vi.mock('./linkedInConnection.service', () => ({ LinkedInConnectionService: { store: mocks.store } }))

vi.mock('core', () => ({ MessageFiles: { read: vi.fn() } }))

const file = () =>
   JSON.stringify({
      contract: 1,
      captured_at: '2026-10-28T12:00:00.000Z',
      complete: true,
      connections: [
         {
            slug: 'person-1',
            name: 'Person One',
            headline: '',
         },
      ],
   })

const session = (names: string[]) => ({
   userId: 'u1',
   linkedInAccountId: 'acc1',
   verdict: 'DONE',
   artifacts: names.map(name => ({
      name,
      path: `runs/linkedin-connections/u1/2026/10/28/s1/${name}`,
      kind: 'file',
   })),
})

describe('ConnectionImportService.run', () => {
   beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-28T12:00:00Z') })
      vi.resetAllMocks()
      mocks.store.mockResolvedValue(1)
   })

   afterEach(() => vi.useRealTimers())

   it('should store the file of a run for the owner and the account of its session, with the verdict, and finish the import', async () => {
      const read = vi.fn(async (_path: string) => file())

      mocks.findSession.mockResolvedValue(session(['connections.json']))

      await expect(ConnectionImportService.run('s1', 0, read)).resolves.toBe('done')

      expect(mocks.store).toHaveBeenCalledWith(
         {
            userId: 'u1',
            accountId: 'acc1',
         },
         expect.objectContaining({ complete: true }),
         {
            id: 's1',
            verdict: 'DONE',
         }
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

   it('should finish a run that has no file without reading anything', async () => {
      const read = vi.fn()

      mocks.findSession.mockResolvedValue(session([]))

      await expect(ConnectionImportService.run('s1', 0, read)).resolves.toBe('done')
      expect(read).not.toHaveBeenCalled()
      expect(mocks.store).not.toHaveBeenCalled()
   })

   it('should try again later when the file cannot be read, and say only the kind of failure', async () => {
      mocks.findSession.mockResolvedValue(session(['connections.json']))

      await expect(
         ConnectionImportService.run('s1', 0, async () => {
            throw new Error('secret name of a person')
         })
      ).resolves.toBe('retry')

      const [[{ data }]] = mocks.updateMany.mock.calls

      expect(data).toMatchObject({
         status: 'PENDING',
         attempts: 1,
         lastError: 'Error',
      })
      expect(JSON.stringify(data)).not.toContain('secret name')
      expect(data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
   })

   it('should give up on a file that is not of the contract after the last attempt, and at once for a session that is gone', async () => {
      mocks.findSession.mockResolvedValue(session(['connections.json']))

      await expect(ConnectionImportService.run('s1', 4, async () => '{"contract":2}')).resolves.toBe('failed')
      expect(mocks.updateMany.mock.calls[0]?.[0].data).toMatchObject({
         status: 'FAILED',
         lastError: 'ZodError',
      })

      mocks.findSession.mockResolvedValue(null)

      await expect(ConnectionImportService.run('s1', 0, async () => file())).resolves.toBe('failed')
   })
})
