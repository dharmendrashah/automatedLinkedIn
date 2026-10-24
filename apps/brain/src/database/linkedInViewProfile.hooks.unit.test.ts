import { describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInViewProfileHooks } from './linkedInViewProfile.hooks'
import { TaskRefusedError } from './taskErrors'

const findUnique = vi.fn()
const updateAccounts = vi.fn()
const updateVisits = vi.fn()
const tx = {
   linkedInAccount: {
      findUnique,
      updateMany: updateAccounts,
   },
   linkedInProfileVisit: { updateMany: updateVisits },
} as unknown as Prisma.TransactionClient

const session = {
   id: 's1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}
const result = (verdict: string) => ({ verdict }) as TaskResult

describe('linkedin-view-profile hooks', () => {
   it('should refuse an account that is not signed in, and let one that is through', async () => {
      const request = {
         id: 's1',
         userId: 'u1',
         accountId: 'acc1',
         task: 'linkedin-view-profile',
         trigger: 'manual' as const,
      }

      findUnique.mockResolvedValueOnce({ status: 'NEEDS_REAUTH' })
      await expect(linkedInViewProfileHooks.onRequest?.(request, tx)).rejects.toBeInstanceOf(TaskRefusedError)

      findUnique.mockResolvedValueOnce({ status: 'ACTIVE' })
      await expect(linkedInViewProfileHooks.onRequest?.(request, tx)).resolves.toBeUndefined()
   })

   it.each([
      ['DONE', 'DONE'],
      ['NOT_AVAILABLE', 'NOT_AVAILABLE'],
      ['ERROR', 'FAILED'],
      ['NEEDS_PROXY', 'FAILED'],
   ])('should write the verdict %s on the visit as %s', async (verdict, status) => {
      updateVisits.mockReset().mockResolvedValue({ count: 1 })
      updateAccounts.mockReset()

      await linkedInViewProfileHooks.onResult?.(session, result(verdict), tx)

      expect(updateVisits).toHaveBeenCalledWith({
         where: {
            sessionId: 's1',
            status: 'ASKED',
         },
         data: {
            status,
            finishedAt: expect.any(Date),
         },
      })
      expect(updateAccounts).not.toHaveBeenCalled()
   })

   it('should bring the sign-in check forward when the run was signed out, and count the visit as failed', async () => {
      updateVisits.mockReset().mockResolvedValue({ count: 1 })
      updateAccounts.mockReset().mockResolvedValue({ count: 1 })

      await linkedInViewProfileHooks.onResult?.(session, result('SIGNED_OUT'), tx)

      expect(updateVisits.mock.calls[0]?.[0].data).toMatchObject({ status: 'FAILED' })
      expect(updateAccounts).toHaveBeenCalledWith({
         where: {
            id: 'acc1',
            status: 'ACTIVE',
         },
         data: { nextCheckAt: expect.any(Date) },
      })
   })
})
