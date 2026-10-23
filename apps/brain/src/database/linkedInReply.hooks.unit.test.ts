import { describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInReplyHooks } from './linkedInReply.hooks'
import { TaskRefusedError } from './taskErrors'

const findUnique = vi.fn()
const tx = {
   linkedInAccount: {
      findUnique,
      updateMany: vi.fn(),
   },
} as unknown as Prisma.TransactionClient

describe('linkedin-reply hooks', () => {
   it('should refuse a reply for an account that is not signed in, and let one that is through', async () => {
      const request = {
         id: 's1',
         userId: 'u1',
         accountId: 'acc1',
         task: 'linkedin-reply',
         trigger: 'manual' as const,
      }

      findUnique.mockResolvedValueOnce({ status: 'NEEDS_REAUTH' })

      await expect(linkedInReplyHooks.onRequest?.(request, tx)).rejects.toBeInstanceOf(TaskRefusedError)

      findUnique.mockResolvedValueOnce({ status: 'ACTIVE' })

      await expect(linkedInReplyHooks.onRequest?.(request, tx)).resolves.toBeUndefined()
   })

   it('should leave a reply that is already sent as it is, whatever a late answer says', async () => {
      const updateMany = vi.fn().mockResolvedValue({ count: 0 })
      const createMany = vi.fn()

      await linkedInReplyHooks.onResult?.(
         {
            id: 's1',
            userId: 'u1',
            linkedInAccountId: 'acc1',
         },
         {
            verdict: 'TIMED_OUT',
            message: 'Took too long.',
         } as TaskResult,
         {
            linkedInReply: { updateMany },
            linkedInAccount: { updateMany: vi.fn() },
            messageImport: { createMany },
         } as unknown as Prisma.TransactionClient
      )

      expect(updateMany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               sessionId: 's1',
               state: { not: 'SENT' },
            },
         })
      )
   })
})
