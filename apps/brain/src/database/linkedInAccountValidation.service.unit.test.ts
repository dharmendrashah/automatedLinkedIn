import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type ValidationOutcome } from '@automatedLinkedIn/contracts'

import {
   LinkedInAccountPausedError,
   LinkedInAccountValidationService,
   LinkedInVerifyCooldownError,
} from './linkedInAccountValidation.service'

const mocks = vi.hoisted(() => ({
   findUnique: vi.fn(),
   findFirst: vi.fn(),
   update: vi.fn(),
   updateMany: vi.fn(),
   publish: vi.fn(),
   getForUser: vi.fn(),
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
      },
   },
}))

vi.mock('./linkedInAccount.service', () => ({ LinkedInAccountService: { getForUser: mocks.getForUser } }))

const row = {
   id: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
   email: 'ada@work.com',
   secret: 'ct',
   secretIv: 'iv',
   secretTag: 'tag',
   keyVersion: 1,
   status: 'PENDING',
}

const validationId = '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11'

describe('LinkedInAccountValidationService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   describe('request', () => {
      it('should remember a new validation on the account, then publish the sealed secrets as stored', async () => {
         mocks.findUnique.mockResolvedValue(row)
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
            requested_at: expect.any(String),
         })
         expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0])
      })

      it('should use a new validation id each time', async () => {
         mocks.findUnique.mockResolvedValue(row)
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

         await expect(LinkedInAccountValidationService.request(row.id)).resolves.toBe(false)
         expect(mocks.publish).not.toHaveBeenCalled()
         expect(mocks.update).not.toHaveBeenCalled()
      })

      it('should keep the account pending, and say so, when the broker is down', async () => {
         mocks.findUnique.mockResolvedValue(row)
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
         mocks.update.mockResolvedValue({})
         mocks.publish.mockRejectedValue(new Error('ECONNREFUSED'))

         await LinkedInAccountValidationService.request(row.id)

         expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('TOPSECRETCIPHERTEXT')
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
   })
})
