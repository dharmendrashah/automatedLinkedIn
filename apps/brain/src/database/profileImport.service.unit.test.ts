import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileImportService } from './profileImport.service'

const mocks = vi.hoisted(() => ({
   queryRaw: vi.fn(),
   findSession: vi.fn(),
   findProfile: vi.fn(),
   upsertProfile: vi.fn(),
   updateAccount: vi.fn(),
   updateMany: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         $queryRawUnsafe: mocks.queryRaw,
         spiderSession: { findUnique: mocks.findSession },
         linkedInAccountProfile: {
            findUnique: mocks.findProfile,
            upsert: mocks.upsertProfile,
         },
         linkedInAccount: { update: mocks.updateAccount },
         profileImport: { updateMany: mocks.updateMany },
      },
   },
}))

vi.mock('core', () => ({ MessageFiles: { read: vi.fn() } }))

const file = (capturedAt = '2026-10-24T12:00:00.000Z', imageUrl?: string) =>
   JSON.stringify({
      contract: 1,
      captured_at: capturedAt,
      profileUrl: 'https://www.linkedin.com/in/sample-person/',
      name: 'Sample Person',
      ...(imageUrl && { imageUrl }),
      verified: false,
      topSkills: [],
      services: [],
      experience: [],
      education: [],
      projects: {
         items: [],
         total: 0,
      },
      skills: {
         items: [],
         total: 0,
      },
      recommendations: {
         received: {
            items: [],
            total: 0,
         },
         given: {
            items: [],
            total: 0,
         },
      },
      languages: {
         items: [],
         total: 0,
      },
      interests: {
         topVoices: [],
         companies: [],
         groups: [],
         newsletters: [],
         schools: [],
      },
      peopleYouMayKnow: [],
      youMightLike: [],
   })

const session = (verdict = 'DONE', names = ['profile.json']) => ({
   userId: 'u1',
   linkedInAccountId: 'acc1',
   verdict,
   artifacts: names.map(name => ({
      name,
      path: `runs/linkedin-profile/u1/2026/10/24/s1/${name}`,
      kind: 'file',
   })),
})

describe('ProfileImportService.run', () => {
   beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-24T12:00:00Z') })
      vi.resetAllMocks()
      mocks.findProfile.mockResolvedValue(null)
   })

   afterEach(() => vi.useRealTimers())

   it('should store the profile for the owner and account of the session, and finish the import', async () => {
      const read = vi.fn(async (_path: string) => file())

      mocks.findSession.mockResolvedValue(session())

      await expect(ProfileImportService.run('s1', 0, read)).resolves.toBe('done')

      expect(read).toHaveBeenCalledWith('runs/linkedin-profile/u1/2026/10/24/s1/profile.json')
      expect(mocks.upsertProfile).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { accountId: 'acc1' },
            create: expect.objectContaining({
               accountId: 'acc1',
               userId: 'u1',
               sessionId: 's1',
               capturedAt: new Date('2026-10-24T12:00:00.000Z'),
            }),
            update: expect.objectContaining({
               sessionId: 's1',
               capturedAt: new Date('2026-10-24T12:00:00.000Z'),
            }),
         })
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

   it('should give the account the name and picture of its profile, and keep the picture it has when the read had none', async () => {
      mocks.findSession.mockResolvedValue(session())

      await ProfileImportService.run('s1', 0, async () => file(undefined, 'https://media.licdn.com/dms/image/me'))
      await ProfileImportService.run('s1', 0, async () => file())

      expect(mocks.updateAccount).toHaveBeenNthCalledWith(1, {
         where: { id: 'acc1' },
         data: {
            displayName: 'Sample Person',
            imageUrl: 'https://media.licdn.com/dms/image/me',
         },
      })
      expect(mocks.updateAccount).toHaveBeenNthCalledWith(2, {
         where: { id: 'acc1' },
         data: { displayName: 'Sample Person' },
      })
   })

   it('should keep a stored profile when the run was only partial, and store it when nothing is stored yet', async () => {
      mocks.findSession.mockResolvedValue(session('PARTIAL'))
      mocks.findProfile.mockResolvedValueOnce({ capturedAt: new Date('2026-10-01T00:00:00Z') })

      await expect(ProfileImportService.run('s1', 0, async () => file())).resolves.toBe('done')
      expect(mocks.upsertProfile).not.toHaveBeenCalled()

      await expect(ProfileImportService.run('s1', 0, async () => file())).resolves.toBe('done')
      expect(mocks.upsertProfile).toHaveBeenCalledTimes(1)
   })

   it('should not replace a profile with an older read', async () => {
      mocks.findSession.mockResolvedValue(session())
      mocks.findProfile.mockResolvedValue({ capturedAt: new Date('2026-10-25T00:00:00Z') })

      await expect(ProfileImportService.run('s1', 0, async () => file())).resolves.toBe('done')
      expect(mocks.upsertProfile).not.toHaveBeenCalled()
      expect(mocks.updateAccount).not.toHaveBeenCalled()
   })

   it('should finish a run that has no profile file without reading anything', async () => {
      const read = vi.fn()

      mocks.findSession.mockResolvedValue(session('DONE', []))

      await expect(ProfileImportService.run('s1', 0, read)).resolves.toBe('done')
      expect(read).not.toHaveBeenCalled()
      expect(mocks.upsertProfile).not.toHaveBeenCalled()
   })

   it('should try again later when the file cannot be read, and say only the kind of failure', async () => {
      mocks.findSession.mockResolvedValue(session())

      await expect(
         ProfileImportService.run('s1', 0, async () => {
            throw new Error('Sample Person phone number')
         })
      ).resolves.toBe('retry')

      const [[{ data }]] = mocks.updateMany.mock.calls

      expect(data).toMatchObject({
         status: 'PENDING',
         attempts: 1,
         claimedUntil: null,
         lastError: 'Error',
      })
      expect(JSON.stringify(data)).not.toContain('phone number')
      expect(data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
   })

   it('should refuse a file that is not of the contract, and give up after the last attempt', async () => {
      mocks.findSession.mockResolvedValue(session())

      await expect(ProfileImportService.run('s1', 4, async () => '{"name":"x"}')).resolves.toBe('failed')
      expect(mocks.updateMany.mock.calls[0]?.[0].data).toMatchObject({
         status: 'FAILED',
         attempts: 5,
      })
      expect(mocks.upsertProfile).not.toHaveBeenCalled()
   })

   it('should end an import whose session is gone', async () => {
      mocks.findSession.mockResolvedValue(null)

      await expect(ProfileImportService.run('s1', 0, vi.fn())).resolves.toBe('failed')
   })
})

describe('ProfileImportService.importDue', () => {
   beforeEach(() => vi.resetAllMocks())

   it('should do nothing when no import is due', async () => {
      mocks.queryRaw.mockResolvedValue([])

      await expect(ProfileImportService.importDue()).resolves.toEqual({
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

      await expect(ProfileImportService.importDue(controller.signal)).resolves.toEqual({
         done: 0,
         retried: 0,
         failed: 0,
      })
      expect(mocks.findSession).not.toHaveBeenCalled()
   })
})
