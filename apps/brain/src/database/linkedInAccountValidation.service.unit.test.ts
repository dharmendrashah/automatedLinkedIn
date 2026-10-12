import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SECURITY_CHECK_MESSAGE, type ValidationOutcome } from '@automatedLinkedIn/contracts'

import {
   LinkedInAccountPausedError,
   LinkedInAccountValidationService,
   LinkedInVerifyCooldownError,
   SessionRetryError,
} from './linkedInAccountValidation.service'

const mocks = vi.hoisted(() => ({
   findUnique: vi.fn(),
   findFirst: vi.fn(),
   update: vi.fn(),
   updateMany: vi.fn(),
   publish: vi.fn(),
   getForUser: vi.fn(),
   pickForAccount: vi.fn(),
   findFirstSession: vi.fn(),
   findFirstProxy: vi.fn(),
   startSession: vi.fn(),
   failSession: vi.fn(),
   finishSession: vi.fn(),
}))

vi.mock('core', () => ({ AccountValidationQueue: { publish: mocks.publish } }))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInAccount: {
            findUnique: mocks.findUnique,
            findFirst: mocks.findFirst,
            update: mocks.update,
            updateMany: mocks.updateMany,
         },
         spiderSession: { findFirst: mocks.findFirstSession },
         proxyServer: { findFirst: mocks.findFirstProxy },
      },
   },
}))

vi.mock('./linkedInAccount.service', () => ({ LinkedInAccountService: { getForUser: mocks.getForUser } }))
vi.mock('./proxyServer.service', () => ({ ProxyServerService: { pickForAccount: mocks.pickForAccount } }))
vi.mock('./spiderSession.service', () => ({
   SpiderSessionService: {
      start: mocks.startSession,
      fail: mocks.failSession,
      finish: mocks.finishSession,
   },
}))

const row = {
   id: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
   userId: 'u1',
   email: 'ada@work.com',
   secret: 'ct',
   secretIv: 'iv',
   secretTag: 'tag',
   keyVersion: 1,
   status: 'PENDING',
}

const validationId = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'

// What ProxyServerService.pickForAccount returns: the worker's config, and a summary without credentials.
const proxy = {
   config: { server: 'http://10.0.0.1:8080' },
   summary: {
      id: 'p1',
      protocol: 'HTTP',
      host: '10.0.0.1',
      port: 8080,
      country: 'Canada',
   },
}

describe('LinkedInAccountValidationService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   describe('request', () => {
      it('should remember a new validation on the account, then publish the sealed secrets as stored', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockResolvedValue(undefined)

         await expect(LinkedInAccountValidationService.request(row.id)).resolves.toBe(true)

         const [[{ data }]] = mocks.update.mock.calls
         const [[command]] = mocks.publish.mock.calls

         expect(mocks.update.mock.calls[0][0].where).toEqual({ id: row.id })
         expect(data).toEqual({
            validationId: expect.any(String),
            validationRequestedAt: expect.any(Date),
         })
         expect(command).toEqual({
            validation_id: data.validationId,
            account_id: row.id,
            email: 'ada@work.com',
            sealed: {
               ciphertext: 'ct',
               iv: 'iv',
               tag: 'tag',
               key_version: 1,
            },
            proxy: proxy.config,
            requested_at: expect.any(String),
         })
         expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0])
      })

      it('should note the session before it queues the check, with the proxy summary and the owner', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockResolvedValue(undefined)

         await LinkedInAccountValidationService.request(row.id)

         expect(mocks.startSession).toHaveBeenCalledWith({
            id: mocks.publish.mock.calls[0][0].validation_id,
            userId: 'u1',
            linkedInAccountId: row.id,
            email: 'ada@work.com',
            proxy: proxy.summary,
         })
         expect(mocks.startSession.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0])
      })

      it('should ask for the proxy it was told to use, and remember which session it retries', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockResolvedValue(undefined)

         await LinkedInAccountValidationService.request(row.id, {
            proxyId: 'p9',
            retryOfId: 'old-session',
            validationId,
         })

         expect(mocks.pickForAccount).toHaveBeenCalledWith(row.id, 'p9')
         expect(mocks.publish.mock.calls[0][0].validation_id).toBe(validationId)
         expect(mocks.startSession).toHaveBeenCalledWith(
            expect.objectContaining({
               id: validationId,
               retryOfId: 'old-session',
            })
         )
      })

      it('should end the session as failed, not leave it in progress, when the check cannot be queued', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockRejectedValue(new Error('ECONNREFUSED'))

         await LinkedInAccountValidationService.request(row.id)

         expect(mocks.failSession).toHaveBeenCalledWith(
            mocks.startSession.mock.calls[0][0].id,
            'The check could not be queued. Try again in a moment.'
         )
      })

      it('should not note a session when no proxy is available, as nothing runs', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.pickForAccount.mockResolvedValue(null)
         mocks.update.mockResolvedValue({})

         await LinkedInAccountValidationService.request(row.id)

         expect(mocks.startSession).not.toHaveBeenCalled()
      })

      it('should use a new validation id each time', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockResolvedValue(undefined)

         await LinkedInAccountValidationService.request(row.id)
         await LinkedInAccountValidationService.request(row.id)

         expect(mocks.update.mock.calls[0][0].data.validationId).not.toBe(
            mocks.update.mock.calls[1][0].data.validationId
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
      ])('should not publish anything for %s', async (_name, found) => {
         mocks.findUnique.mockResolvedValue(found)
         mocks.pickForAccount.mockResolvedValue(proxy)

         await expect(LinkedInAccountValidationService.request(row.id)).resolves.toBe(false)
         expect(mocks.publish).not.toHaveBeenCalled()
         expect(mocks.update).not.toHaveBeenCalled()
      })

      it('should keep the account pending and tell the owner to add a proxy, without publishing, when it has none', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.pickForAccount.mockResolvedValue(null)
         mocks.update.mockResolvedValue({})

         await expect(LinkedInAccountValidationService.request(row.id)).resolves.toBe(false)
         expect(mocks.publish).not.toHaveBeenCalled()
         expect(mocks.update).toHaveBeenCalledTimes(1)
         expect(mocks.update.mock.calls[0][0]).toEqual({
            where: { id: row.id },
            data: {
               statusMessage: 'Add a proxy to verify this account.',
               statusUpdatedAt: expect.any(Date),
            },
         })
      })

      it('should keep the account pending, and say so, when the broker is down', async () => {
         mocks.findUnique.mockResolvedValue(row)
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockRejectedValue(new Error('ECONNREFUSED'))

         await expect(LinkedInAccountValidationService.request(row.id)).resolves.toBe(false)
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'))
      })

      it('should never log the sealed secrets', async () => {
         mocks.findUnique.mockResolvedValue({
            ...row,
            secret: 'TOPSECRETCIPHERTEXT',
         })
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockRejectedValue(new Error('ECONNREFUSED'))

         await LinkedInAccountValidationService.request(row.id)

         expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('TOPSECRETCIPHERTEXT')
      })
   })

   describe('requestIfWaiting', () => {
      it('should validate an account that is pending and has no validation in flight', async () => {
         mocks.findUnique.mockResolvedValue({
            ...row,
            validationId: null,
         })
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockResolvedValue(undefined)

         await expect(LinkedInAccountValidationService.requestIfWaiting(row.id)).resolves.toBe(true)
         expect(mocks.publish).toHaveBeenCalledTimes(1)
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
         mocks.pickForAccount.mockResolvedValue(proxy)

         await expect(LinkedInAccountValidationService.requestIfWaiting(row.id)).resolves.toBe(false)
         expect(mocks.publish).not.toHaveBeenCalled()
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
         expect(mocks.publish).not.toHaveBeenCalled()
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
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should set the account back to pending and request a validation once the cooldown has passed', async () => {
         mocks.findFirst.mockResolvedValue({
            id: row.id,
            status: 'NEEDS_REAUTH',
            validationRequestedAt: asked(6),
         })
         mocks.findUnique.mockResolvedValue(row)
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockResolvedValue(undefined)
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
         expect(mocks.publish).toHaveBeenCalledTimes(1)
      })

      it('should accept an account that was never asked to validate', async () => {
         mocks.findFirst.mockResolvedValue({
            id: row.id,
            status: 'PENDING',
            validationRequestedAt: null,
         })
         mocks.findUnique.mockResolvedValue(row)
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockResolvedValue(undefined)
         mocks.getForUser.mockResolvedValue({ id: row.id })

         await LinkedInAccountValidationService.verifyForUser('u1', row.id)

         expect(mocks.publish).toHaveBeenCalledTimes(1)
      })
   })

   describe('applyResult', () => {
      const result = {
         validation_id: validationId,
         account_id: row.id,
         outcome: 'VALID' as ValidationOutcome,
         message: 'Signed in',
         checked_at: '2026-10-12T10:00:05.000Z',
      }

      const applied = async (over: Partial<typeof result> = {}) => {
         mocks.updateMany.mockResolvedValue({ count: 1 })

         await LinkedInAccountValidationService.applyResult({
            ...result,
            ...over,
         })

         return mocks.updateMany.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> }
      }

      it('should only touch the account that is waiting for this very validation, and never a paused one', async () => {
         const { where } = await applied()

         expect(where).toEqual({
            id: row.id,
            validationId,
            status: { not: 'DISABLED' },
         })
      })

      it('should make the account ACTIVE and note the time, clearing the message and the waiting id', async () => {
         const { data } = await applied()

         expect(data).toMatchObject({
            status: 'ACTIVE',
            statusMessage: null,
            validationId: null,
            lastVerifiedAt: expect.any(Date),
            statusUpdatedAt: expect.any(Date),
         })
      })

      it.each([
         ['INVALID_CREDENTIALS', 'NEEDS_REAUTH'],
         ['NEEDS_REAUTH', 'NEEDS_REAUTH'],
         ['ERROR', 'ERROR'],
      ] as const)('should turn the outcome %s into the status %s, with the message', async (outcome, status) => {
         const { data } = await applied({
            outcome,
            message: 'Something short',
         })

         expect(data).toMatchObject({
            status,
            statusMessage: 'Something short',
            validationId: null,
         })
         expect(data).not.toHaveProperty('lastVerifiedAt')
      })

      it('should report whether the result was used', async () => {
         mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

         await expect(LinkedInAccountValidationService.applyResult(result)).resolves.toBe(true)
         await expect(LinkedInAccountValidationService.applyResult(result)).resolves.toBe(false)
      })

      it('should let a database failure through, so the result is tried again', async () => {
         mocks.updateMany.mockRejectedValue(new Error('database down'))

         await expect(LinkedInAccountValidationService.applyResult(result)).rejects.toThrow('database down')
      })

      it('should give the session its own verdict, even when the account no longer waits for this check', async () => {
         mocks.updateMany.mockResolvedValue({ count: 0 })

         await expect(LinkedInAccountValidationService.applyResult(result)).resolves.toBe(false)
         expect(mocks.finishSession).toHaveBeenCalledWith(result)
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
         mocks.pickForAccount.mockResolvedValue(proxy)
         mocks.update.mockResolvedValue({})
         mocks.publish.mockResolvedValue(undefined)
      }

      it('should only find a session that is the users own', async () => {
         mocks.findFirstSession.mockResolvedValue(null)

         const attempt = LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')

         await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND' })
         expect(mocks.findFirstSession.mock.calls[0][0].where).toEqual({
            id: 'old-session',
            userId: 'u1',
         })
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should start the same check again through the chosen proxy and say which session it retries', async () => {
         allow()

         const started = await LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')

         expect(started).toEqual({ id: mocks.publish.mock.calls[0][0].validation_id })
         expect(mocks.pickForAccount).toHaveBeenCalledWith(row.id, 'p2')
         expect(mocks.startSession).toHaveBeenCalledWith(
            expect.objectContaining({
               id: started.id,
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
         expect(mocks.publish).not.toHaveBeenCalled()
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
         expect(mocks.publish).not.toHaveBeenCalled()
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
         expect(mocks.publish).not.toHaveBeenCalled()
      })

      it('should say so when the check could not be started', async () => {
         allow()
         mocks.publish.mockRejectedValue(new Error('ECONNREFUSED'))

         const attempt = LinkedInAccountValidationService.retryForUser('u1', 'old-session', 'p2')

         await expect(attempt).rejects.toMatchObject({ code: 'REFUSED' })
      })
   })
})
