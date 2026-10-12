import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SECURITY_CHECK_MESSAGE } from '@automatedLinkedIn/contracts'

import {
   LinkedInAccountPausedError,
   LinkedInAccountValidationService,
   LinkedInVerifyCooldownError,
   SessionRetryError,
} from './linkedInAccountValidation.service'
import { TaskNeedsProxyError, TaskRefusedError } from './taskErrors'

const mocks = vi.hoisted(() => ({
   findUnique: vi.fn(),
   findFirst: vi.fn(),
   update: vi.fn(),
   request: vi.fn(),
   getForUser: vi.fn(),
   findFirstSession: vi.fn(),
   findFirstProxy: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInAccount: {
            findUnique: mocks.findUnique,
            findFirst: mocks.findFirst,
            update: mocks.update,
         },
         spiderSession: { findFirst: mocks.findFirstSession },
         proxyServer: { findFirst: mocks.findFirstProxy },
      },
   },
}))

vi.mock('./linkedInAccount.service', () => ({ LinkedInAccountService: { getForUser: mocks.getForUser } }))
vi.mock('./task.service', () => ({ TaskService: { request: mocks.request } }))

const row = {
   id: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
   userId: 'u1',
   status: 'PENDING',
}

const validationId = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'

describe('LinkedInAccountValidationService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   describe('request', () => {
      it('should ask for the LinkedIn sign-in check of the account, for its owner, as an automatic one', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.request.mockResolvedValue({ id: 'task-1' })

         await expect(LinkedInAccountValidationService.request(row.id)).resolves.toBe(true)

         expect(mocks.request).toHaveBeenCalledWith({
            userId: 'u1',
            task: 'linkedin-login',
            accountId: row.id,
            proxyId: undefined,
            trigger: 'automatic',
         })
      })

      it('should say the owner asked when they did, and through which proxy', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.request.mockResolvedValue({ id: 'task-1' })

         await LinkedInAccountValidationService.request(row.id, {
            asked: true,
            proxyId: 'p2',
         })

         expect(mocks.request).toHaveBeenCalledWith(
            expect.objectContaining({
               trigger: 'manual',
               proxyId: 'p2',
            })
         )
      })

      it.each([
         ['an account that does not exist', null],
         [
            'a paused account',
            {
               ...row,
               status: 'DISABLED',
            },
         ],
      ])('should do nothing for %s', async (_name, found) => {
         mocks.findUnique.mockResolvedValue(found)

         await expect(LinkedInAccountValidationService.request(row.id)).resolves.toBe(false)
         expect(mocks.request).not.toHaveBeenCalled()
      })

      it('should tell the owner to add a proxy when the account has none, and never sign in from this server', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.request.mockRejectedValue(new TaskNeedsProxyError())
         mocks.update.mockResolvedValue({})

         await expect(LinkedInAccountValidationService.request(row.id)).resolves.toBe(false)

         expect(mocks.update.mock.calls[0][0].data).toMatchObject({
            statusMessage: 'Add a proxy to verify this account.',
         })
      })

      it('should not fail the caller when the check is refused or cannot be queued', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.request.mockRejectedValue(new TaskRefusedError('already running'))

         await expect(LinkedInAccountValidationService.request(row.id)).resolves.toBe(false)
         expect(mocks.update).not.toHaveBeenCalled()

         mocks.request.mockRejectedValue(new Error('database down'))

         await expect(LinkedInAccountValidationService.request(row.id)).resolves.toBe(false)
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('database down'))
      })
   })

   describe('requestIfWaiting', () => {
      it('should validate an account that is pending and has no validation in flight', async () => {
         mocks.findUnique.mockResolvedValue({
            ...row,
            validationId: null,
         })
         mocks.request.mockResolvedValue({ id: 'task-1' })

         await expect(LinkedInAccountValidationService.requestIfWaiting(row.id)).resolves.toBe(true)
         expect(mocks.request).toHaveBeenCalledTimes(1)
      })

      it.each([
         ['an account that does not exist', null],
         [
            'an active account',
            {
               ...row,
               status: 'ACTIVE',
               validationId: null,
            },
         ],
         [
            'a paused account',
            {
               ...row,
               status: 'DISABLED',
               validationId: null,
            },
         ],
         [
            'an account already waiting for a result',
            {
               ...row,
               validationId,
            },
         ],
      ])('should do nothing for %s', async (_name, found) => {
         mocks.findUnique.mockResolvedValue(found)

         await expect(LinkedInAccountValidationService.requestIfWaiting(row.id)).resolves.toBe(false)
         expect(mocks.request).not.toHaveBeenCalled()
         expect(mocks.update).not.toHaveBeenCalled()
      })
   })

   describe('verifyForUser', () => {
      const asked = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000)

      it('should return null when the account is not the users', async () => {
         mocks.findFirst.mockResolvedValue(null)

         await expect(LinkedInAccountValidationService.verifyForUser('u1', row.id)).resolves.toBeNull()
         expect(mocks.findFirst.mock.calls[0][0].where).toEqual({
            id: row.id,
            userId: 'u1',
         })
         expect(mocks.request).not.toHaveBeenCalled()
      })

      it('should refuse a paused account, which has to be resumed first', async () => {
         mocks.findFirst.mockResolvedValue({
            id: row.id,
            status: 'DISABLED',
            validationRequestedAt: null,
         })

         await expect(LinkedInAccountValidationService.verifyForUser('u1', row.id)).rejects.toBeInstanceOf(
            LinkedInAccountPausedError
         )
      })

      it('should refuse a second request within the cooldown, and say how long to wait', async () => {
         mocks.findFirst.mockResolvedValue({
            id: row.id,
            status: 'ACTIVE',
            validationRequestedAt: asked(2),
         })

         const attempt = LinkedInAccountValidationService.verifyForUser('u1', row.id)

         await expect(attempt).rejects.toBeInstanceOf(LinkedInVerifyCooldownError)
         await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: expect.any(Number) })
         expect(mocks.request).not.toHaveBeenCalled()
      })

      it('should set the account back to pending and request a validation once the cooldown has passed', async () => {
         mocks.findFirst.mockResolvedValue({
            id: row.id,
            status: 'NEEDS_REAUTH',
            validationRequestedAt: asked(6),
         })
         mocks.findUnique.mockResolvedValue(row)
         mocks.update.mockResolvedValue({})
         mocks.request.mockResolvedValue({ id: 'task-1' })
         mocks.getForUser.mockResolvedValue({
            id: row.id,
            status: 'PENDING',
         })

         await expect(LinkedInAccountValidationService.verifyForUser('u1', row.id)).resolves.toEqual({
            id: row.id,
            status: 'PENDING',
         })

         expect(mocks.update.mock.calls[0][0].data).toMatchObject({
            status: 'PENDING',
            statusMessage: null,
         })
         expect(mocks.request).toHaveBeenCalledTimes(1)
      })

      it('should accept an account that was never asked to validate', async () => {
         mocks.findFirst.mockResolvedValue({
            id: row.id,
            status: 'PENDING',
            validationRequestedAt: null,
         })
         mocks.findUnique.mockResolvedValue(row)
         mocks.update.mockResolvedValue({})
         mocks.request.mockResolvedValue({ id: 'task-1' })
         mocks.getForUser.mockResolvedValue({ id: row.id })

         await LinkedInAccountValidationService.verifyForUser('u1', row.id)

         expect(mocks.request).toHaveBeenCalledTimes(1)
      })
   })

   describe('retryForUser', () => {
      const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

      const failed = (overrides: Record<string, unknown> = {}) => ({
         id: 'old-session',
         kind: 'VALIDATE_ACCOUNT',
         status: 'FAILED',
         outcome: 'ERROR',
         message: 'LinkedIn showed a page the check does not understand.',
         linkedInAccountId: row.id,
         linkedInAccount: {
            status: 'ERROR',
            validationId: null,
            validationRequestedAt: minutesAgo(10),
         },
         ...overrides,
      })

      const allow = () => {
         mocks.findFirstSession.mockResolvedValue(failed())
         mocks.findFirstProxy.mockResolvedValue({ id: 'p2' })
         mocks.findUnique.mockResolvedValue(row)
         mocks.update.mockResolvedValue({})
         mocks.request.mockResolvedValue({ id: 'task-1' })
      }

      it('should only find a session that is the users own', async () => {
         mocks.findFirstSession.mockResolvedValue(null)

         const attempt = LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')

         await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND' })
         expect(mocks.findFirstSession.mock.calls[0][0].where).toEqual({
            id: 'old-session',
            userId: 'u1',
         })
         expect(mocks.request).not.toHaveBeenCalled()
      })

      it('should start the same check again through the chosen proxy and say which session it retries', async () => {
         allow()

         const started = await LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')

         expect(started).toEqual({ id: 'task-1' })
         expect(mocks.request).toHaveBeenCalledWith(
            expect.objectContaining({
               task: 'linkedin-login',
               accountId: row.id,
               proxyId: 'p2',
               trigger: 'retry',
               retryOfId: 'old-session',
            })
         )
         expect(mocks.update.mock.calls[0][0].data).toMatchObject({
            status: 'PENDING',
            statusMessage: null,
         })
      })

      it('should retry a security check, where another address may help', async () => {
         allow()
         mocks.findFirstSession.mockResolvedValue(
            failed({
               outcome: 'NEEDS_REAUTH',
               message: SECURITY_CHECK_MESSAGE,
            })
         )

         await expect(LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')).resolves.toBeDefined()
      })

      it.each([
         [
            'a check that succeeded',
            {
               status: 'SUCCEEDED',
               outcome: 'VALID',
            },
         ],
         [
            'a check still in progress',
            {
               status: 'IN_PROGRESS',
               outcome: null,
            },
         ],
         [
            'a rejected password',
            {
               outcome: 'INVALID_CREDENTIALS',
               message: 'LinkedIn did not accept the email or password.',
            },
         ],
         [
            'a rejected two-step code',
            {
               outcome: 'NEEDS_REAUTH',
               message: 'LinkedIn did not accept the two-step code.',
            },
         ],
         [
            'a missing credential',
            {
               outcome: 'NEEDS_REAUTH',
               message: 'No password or browser token is stored.',
            },
         ],
         ['a kind of run that cannot be retried', { kind: 'SCRAPE' }],
      ])('should refuse to retry %s', async (_name, overrides) => {
         allow()
         mocks.findFirstSession.mockResolvedValue(failed(overrides))

         await expect(LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')).rejects.toBeInstanceOf(
            SessionRetryError
         )
         expect(mocks.request).not.toHaveBeenCalled()
      })

      it('should refuse a paused account', async () => {
         allow()
         mocks.findFirstSession.mockResolvedValue(
            failed({
               linkedInAccount: {
                  status: 'DISABLED',
                  validationId: null,
                  validationRequestedAt: null,
               },
            })
         )

         await expect(LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')).rejects.toBeInstanceOf(
            LinkedInAccountPausedError
         )
      })

      it('should refuse while another check of the account is in progress', async () => {
         allow()
         mocks.findFirstSession.mockResolvedValue(
            failed({
               linkedInAccount: {
                  status: 'PENDING',
                  validationId: 'another',
                  validationRequestedAt: minutesAgo(10),
               },
            })
         )

         await expect(LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')).rejects.toMatchObject({
            code: 'REFUSED',
            message: expect.stringContaining('in progress'),
         })
      })

      it('should keep the wait between two checks of the same account', async () => {
         allow()
         mocks.findFirstSession.mockResolvedValue(
            failed({
               linkedInAccount: {
                  status: 'ERROR',
                  validationId: null,
                  validationRequestedAt: minutesAgo(2),
               },
            })
         )

         await expect(LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')).rejects.toBeInstanceOf(
            LinkedInVerifyCooldownError
         )
         expect(mocks.request).not.toHaveBeenCalled()
      })

      it('should refuse a proxy that is not one of this account usable proxies', async () => {
         allow()
         mocks.findFirstProxy.mockResolvedValue(null)

         await expect(
            LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'someone-elses')
         ).rejects.toMatchObject({ code: 'REFUSED' })
         expect(mocks.findFirstProxy.mock.calls[0][0].where).toEqual({
            id: 'someone-elses',
            linkedInAccountId: row.id,
            status: { in: ['ACTIVE', 'GEO_MISMATCH'] },
         })
         expect(mocks.request).not.toHaveBeenCalled()
      })

      it('should say so when the check could not be started', async () => {
         allow()
         mocks.request.mockRejectedValue(new Error('ECONNREFUSED'))

         const attempt = LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')

         await expect(attempt).rejects.toMatchObject({ code: 'REFUSED' })
      })
   })
})
