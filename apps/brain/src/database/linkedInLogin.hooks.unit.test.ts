import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInLoginHooks } from './linkedInLogin.hooks'
import { TaskRefusedError } from './taskErrors'

const mocks = vi.hoisted(() => ({
   findAccount: vi.fn(),
   updateAccount: vi.fn(),
   updateManyAccounts: vi.fn(),
}))

vi.mock('./prisma.service', () => ({ PrismaService: { client: {} } }))

const MINUTE_MS = 60 * 1000

const request = {
   id: 'task-1',
   userId: 'u1',
   accountId: 'acc1',
   proxyId: 'p1',
   task: 'linkedin-login',
   trigger: 'automatic' as const,
}

const result = (overrides: Partial<TaskResult> = {}): TaskResult => ({
   contract: 1,
   task_id: 'task-1',
   task: 'linkedin-login',
   task_version: 1,
   status: 'SUCCEEDED',
   verdict: 'VALID',
   message: 'Signed in to LinkedIn.',
   artifacts: [],
   artifacts_truncated: false,
   worker: { build: 'abc1234' },
   started_at: '2026-10-13T10:00:00.000Z',
   finished_at: '2026-10-13T10:00:30.000Z',
   ...overrides,
})

const session = {
   id: 'task-1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}

const tx = {
   linkedInAccount: {
      findUnique: mocks.findAccount,
      update: mocks.updateAccount,
      updateMany: mocks.updateManyAccounts,
   },
} as unknown as Prisma.TransactionClient

describe('linkedin-login hooks', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.findAccount.mockResolvedValue({
         status: 'PENDING',
         validationRequestedAt: null,
      })
      mocks.updateAccount.mockResolvedValue({})
   })

   describe('onRequest', () => {
      it('should note the task on the account, so only its own answer can change the account', async () => {
         await linkedInLoginHooks.onRequest?.(request, tx)

         expect(mocks.updateAccount).toHaveBeenCalledWith({
            where: { id: 'acc1' },
            data: {
               validationId: 'task-1',
               validationRequestedAt: expect.any(Date),
            },
         })
      })

      it('should refuse a paused account', async () => {
         mocks.findAccount.mockResolvedValue({
            status: 'DISABLED',
            validationRequestedAt: null,
         })

         await expect(linkedInLoginHooks.onRequest?.(request, tx)).rejects.toBeInstanceOf(TaskRefusedError)
         expect(mocks.updateAccount).not.toHaveBeenCalled()
      })

      it.each(['manual', 'retry'] as const)(
         'should keep the 5 minute wait between two sign-ins when the owner asks (%s)',
         async trigger => {
            mocks.findAccount.mockResolvedValue({
               status: 'ACTIVE',
               validationRequestedAt: new Date(Date.now() - 2 * MINUTE_MS),
            })

            await expect(
               linkedInLoginHooks.onRequest?.(
                  {
                     ...request,
                     trigger,
                  },
                  tx
               )
            ).rejects.toThrow('3 minute')
            expect(mocks.updateAccount).not.toHaveBeenCalled()
         }
      )

      it('should not apply the wait to a sign-in that follows an edit of the account', async () => {
         mocks.findAccount.mockResolvedValue({
            status: 'ACTIVE',
            validationRequestedAt: new Date(Date.now() - MINUTE_MS),
         })

         await expect(linkedInLoginHooks.onRequest?.(request, tx)).resolves.toBeUndefined()
      })

      it('should put the account back to waiting when the owner asks for another sign-in', async () => {
         mocks.findAccount.mockResolvedValue({
            status: 'NEEDS_REAUTH',
            validationRequestedAt: new Date(Date.now() - 10 * MINUTE_MS),
         })

         await linkedInLoginHooks.onRequest?.(
            {
               ...request,
               trigger: 'manual',
            },
            tx
         )

         expect(mocks.updateAccount.mock.calls[0][0].data).toMatchObject({
            status: 'PENDING',
            statusMessage: null,
            validationId: 'task-1',
         })
      })
   })

   describe('onResult', () => {
      it('should mark the account active when the sign-in worked, and clear what it was waiting for', async () => {
         mocks.updateManyAccounts.mockResolvedValue({ count: 1 })

         await linkedInLoginHooks.onResult?.(session, result(), tx)

         expect(mocks.updateManyAccounts).toHaveBeenCalledWith({
            where: {
               id: 'acc1',
               validationId: 'task-1',
               status: { not: 'DISABLED' },
            },
            data: {
               status: 'ACTIVE',
               statusMessage: null,
               lastVerifiedAt: expect.any(Date),
               statusUpdatedAt: expect.any(Date),
               validationId: null,
            },
         })
      })

      it.each([
         ['ERROR', 'ERROR'],
         ['INVALID_CREDENTIALS', 'NEEDS_REAUTH'],
         ['NEEDS_REAUTH', 'NEEDS_REAUTH'],
         ['SECURITY_CHECK', 'NEEDS_REAUTH'],
         ['BLOCKED', 'BLOCKED'],
         ['PROXY_FAILED', 'ERROR'],
         ['CRASHED', 'ERROR'],
         ['NOT_QUEUED', 'ERROR'],
         ['UNKNOWN_TASK', 'ERROR'],
         ['NEEDS_PROXY', 'PENDING'],
      ])(
         'should turn the verdict %s into the account status %s, with the sentence as the reason',
         async (verdict, status) => {
            mocks.updateManyAccounts.mockResolvedValue({ count: 1 })

            await linkedInLoginHooks.onResult?.(
               session,
               result({
                  status: 'FAILED',
                  verdict,
                  message: 'A sentence for the owner.',
               }),
               tx
            )

            expect(mocks.updateManyAccounts.mock.calls[0][0].data).toMatchObject({
               status,
               statusMessage: 'A sentence for the owner.',
               validationId: null,
            })
            expect(mocks.updateManyAccounts.mock.calls[0][0].data).not.toHaveProperty('lastVerifiedAt')
         }
      )

      it('should only let go of an account when the task was cancelled because the owner paused it', async () => {
         mocks.updateManyAccounts.mockResolvedValue({ count: 1 })

         await linkedInLoginHooks.onResult?.(
            session,
            result({
               status: 'FAILED',
               verdict: 'CANCELLED',
               message: 'The account was paused before this task started.',
            }),
            tx
         )

         // Not limited to accounts that are not paused: a paused account is exactly the case.
         expect(mocks.updateManyAccounts).toHaveBeenCalledWith({
            where: {
               id: 'acc1',
               validationId: 'task-1',
            },
            data: { validationId: null },
         })
      })

      it('should leave an account alone that is no longer waiting for this very sign-in', async () => {
         mocks.updateManyAccounts.mockResolvedValue({ count: 0 })

         await expect(linkedInLoginHooks.onResult?.(session, result(), tx)).resolves.toBeUndefined()
      })
   })
})
