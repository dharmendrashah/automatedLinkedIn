import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountProfileService } from './accountProfile.service'
import { TaskRefusedError } from './taskErrors'

const mocks = vi.hoisted(() => ({
   findAccount: vi.fn(),
   findSession: vi.fn(),
   findProfile: vi.fn(),
   request: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInAccount: { findFirst: mocks.findAccount },
         spiderSession: { findFirst: mocks.findSession },
         linkedInAccountProfile: { findFirst: mocks.findProfile },
      },
   },
}))

vi.mock('./task.service', () => ({ TaskService: { request: mocks.request } }))

const NOW = new Date('2026-10-24T12:00:00Z')

const account = (over: Record<string, unknown> = {}) => ({
   status: 'ACTIVE',
   profileAskedAt: null,
   proxyServers: [{ id: 'p1' }],
   ...over,
})

const run = (over: Record<string, unknown> = {}) => ({
   status: 'SUCCEEDED',
   verdict: 'DONE',
   message: 'Read the profile.',
   startedAt: new Date('2026-10-24T11:50:00Z'),
   finishedAt: new Date('2026-10-24T11:55:00Z'),
   profileImport: { status: 'DONE' },
   ...over,
})

const stored = { capturedAt: new Date('2026-10-24T11:54:00Z') }

describe('AccountProfileService.state', () => {
   beforeEach(() => {
      vi.useFakeTimers({ now: NOW })
      vi.resetAllMocks()
      mocks.findAccount.mockResolvedValue(account())
      mocks.findSession.mockResolvedValue(null)
      mocks.findProfile.mockResolvedValue(null)
   })

   it('should answer nothing for an account that is not the owner’s', async () => {
      mocks.findAccount.mockResolvedValue(null)

      await expect(AccountProfileService.state('u1', 'acc1')).resolves.toBeNull()
      expect(mocks.findAccount).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               id: 'acc1',
               userId: 'u1',
            },
         })
      )
   })

   it('should say never read, and that it is the first visit, for an account never asked', async () => {
      await expect(AccountProfileService.state('u1', 'acc1')).resolves.toEqual({
         phase: 'NEVER',
         capturedAt: null,
         firstVisit: true,
         blocker: null,
         lastRun: null,
      })
   })

   it('should say ready, with when it was read, once a profile is stored', async () => {
      mocks.findAccount.mockResolvedValue(account({ profileAskedAt: new Date() }))
      mocks.findProfile.mockResolvedValue(stored)
      mocks.findSession.mockResolvedValue(run())

      await expect(AccountProfileService.state('u1', 'acc1')).resolves.toMatchObject({
         phase: 'READY',
         capturedAt: '2026-10-24T11:54:00.000Z',
         firstVisit: false,
         blocker: null,
         lastRun: {
            ok: true,
            finishedAt: '2026-10-24T11:55:00.000Z',
         },
      })
   })

   it('should say reading while the run is in progress, and while its file waits to be stored', async () => {
      mocks.findSession.mockResolvedValue(
         run({
            status: 'IN_PROGRESS',
            verdict: null,
            finishedAt: null,
         })
      )

      await expect(AccountProfileService.state('u1', 'acc1')).resolves.toMatchObject({
         phase: 'READING',
         blocker: 'The profile is being read.',
         lastRun: null,
      })

      mocks.findSession.mockResolvedValue(run({ profileImport: { status: 'PENDING' } }))

      await expect(AccountProfileService.state('u1', 'acc1')).resolves.toMatchObject({ phase: 'READING' })
   })

   it('should not call a run that never finished reading for ever', async () => {
      mocks.findSession.mockResolvedValue(
         run({
            status: 'IN_PROGRESS',
            verdict: null,
            finishedAt: null,
            startedAt: new Date('2026-10-24T10:00:00Z'),
         })
      )

      await expect(AccountProfileService.state('u1', 'acc1')).resolves.toMatchObject({ phase: 'FAILED' })
   })

   it('should say failed, with the run’s own sentence, when nothing is stored and the last run did not read', async () => {
      mocks.findSession.mockResolvedValue(
         run({
            status: 'FAILED',
            verdict: 'SIGNED_OUT',
            message: 'LinkedIn asked for a sign-in.',
            profileImport: null,
         })
      )

      await expect(AccountProfileService.state('u1', 'acc1')).resolves.toMatchObject({
         phase: 'FAILED',
         lastRun: {
            ok: false,
            message: 'LinkedIn asked for a sign-in.',
         },
      })
   })

   it('should keep saying ready, with the failure of the last run noted, when an earlier profile is stored', async () => {
      mocks.findProfile.mockResolvedValue(stored)
      mocks.findSession.mockResolvedValue(run({ profileImport: { status: 'FAILED' } }))

      await expect(AccountProfileService.state('u1', 'acc1')).resolves.toMatchObject({
         phase: 'READY',
         lastRun: { ok: false },
      })
   })

   it.each([
      [{ status: 'DISABLED' }, 'Resume the account before reading the profile.'],
      [{ status: 'NEEDS_REAUTH' }, 'Reading the profile needs an account that is signed in. Run Test login first.'],
      [{ proxyServers: [] }, 'Add a proxy that works first: reads never go out directly.'],
   ])('should say why a read cannot start (%j)', async (over, blocker) => {
      mocks.findAccount.mockResolvedValue(account(over))

      await expect(AccountProfileService.state('u1', 'acc1')).resolves.toMatchObject({ blocker })
   })
})

describe('AccountProfileService.get', () => {
   beforeEach(() => vi.resetAllMocks())

   it('should give nothing when no profile is stored, or when the stored one no longer fits the contract', async () => {
      mocks.findProfile.mockResolvedValueOnce(null)
      await expect(AccountProfileService.get('u1', 'acc1')).resolves.toEqual({
         profile: null,
         capturedAt: null,
      })

      mocks.findProfile.mockResolvedValueOnce({
         data: { name: 'old shape' },
         capturedAt: new Date('2026-10-24T11:54:00Z'),
      })
      await expect(AccountProfileService.get('u1', 'acc1')).resolves.toEqual({
         profile: null,
         capturedAt: '2026-10-24T11:54:00.000Z',
      })
   })

   it('should look only at the profile of the owner’s own account', async () => {
      mocks.findProfile.mockResolvedValue(null)

      await AccountProfileService.get('u1', 'acc1')

      expect(mocks.findProfile).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               accountId: 'acc1',
               userId: 'u1',
            },
         })
      )
   })
})

describe('AccountProfileService.open', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.findAccount.mockResolvedValue(account())
      mocks.findSession.mockResolvedValue(null)
      mocks.findProfile.mockResolvedValue(null)
      mocks.request.mockResolvedValue({ id: 's1' })
   })

   it('should start the read for an account never asked, signed in and with a proxy', async () => {
      await expect(AccountProfileService.open('u1', 'acc1')).resolves.toEqual({ started: true })
      expect(mocks.request).toHaveBeenCalledWith({
         userId: 'u1',
         task: 'linkedin-profile',
         accountId: 'acc1',
         trigger: 'automatic',
      })
   })

   it('should start nothing for an account that was asked before, or that cannot read now, and say why', async () => {
      mocks.findAccount.mockResolvedValue(account({ profileAskedAt: new Date() }))
      await expect(AccountProfileService.open('u1', 'acc1')).resolves.toEqual({ started: false })

      mocks.findAccount.mockResolvedValue(account({ status: 'PENDING' }))
      await expect(AccountProfileService.open('u1', 'acc1')).resolves.toEqual({
         started: false,
         reason: 'Reading the profile needs an account that is signed in. Run Test login first.',
      })
      expect(mocks.request).not.toHaveBeenCalled()
   })

   it('should answer with the refusal instead of failing when the task cannot start now', async () => {
      mocks.request.mockRejectedValue(new TaskRefusedError('A LinkedIn profile is already running.'))

      await expect(AccountProfileService.open('u1', 'acc1')).resolves.toEqual({
         started: false,
         reason: 'A LinkedIn profile is already running.',
      })
   })

   it('should answer nothing for an account that is not the owner’s', async () => {
      mocks.findAccount.mockResolvedValue(null)

      await expect(AccountProfileService.open('u1', 'acc1')).resolves.toBeNull()
      expect(mocks.request).not.toHaveBeenCalled()
   })
})
