import { describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInMessagesHooks } from './linkedInMessages.hooks'
import { TaskRefusedError } from './taskErrors'

const findUnique = vi.fn()
const updateMany = vi.fn()
const createMany = vi.fn()
const tx = {
   linkedInAccount: {
      findUnique,
      updateMany,
   },
   messageImport: { createMany },
} as unknown as Prisma.TransactionClient

const session = {
   id: 's1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}
const result = (verdict: string) => ({ verdict }) as TaskResult

describe('linkedin-messages hooks', () => {
   it('should refuse a read for an account that is not signed in, and let one that is through', async () => {
      const request = {
         id: 's1',
         userId: 'u1',
         accountId: 'acc1',
         task: 'linkedin-messages',
         trigger: 'manual' as const,
      }

      findUnique.mockResolvedValueOnce({ status: 'NEEDS_REAUTH' })

      await expect(linkedInMessagesHooks.onRequest?.(request, tx)).rejects.toBeInstanceOf(TaskRefusedError)

      findUnique.mockResolvedValueOnce({ status: 'ACTIVE' })

      await expect(linkedInMessagesHooks.onRequest?.(request, tx)).resolves.toBeUndefined()
   })

   it('should queue the files of a run that read something, once', async () => {
      createMany.mockReset().mockResolvedValue({ count: 1 })

      await linkedInMessagesHooks.onResult?.(session, result('DONE'), tx)
      await linkedInMessagesHooks.onResult?.(session, result('PARTIAL'), tx)

      expect(createMany).toHaveBeenCalledTimes(2)
      expect(createMany).toHaveBeenCalledWith({
         data: [{ sessionId: 's1' }],
         skipDuplicates: true,
      })
   })

   it('should store nothing for a run that read nothing, and ask for a sign-in check when it found the account signed out', async () => {
      createMany.mockReset()
      updateMany.mockReset().mockResolvedValue({ count: 1 })

      await linkedInMessagesHooks.onResult?.(session, result('ERROR'), tx)
      await linkedInMessagesHooks.onResult?.(session, result('SIGNED_OUT'), tx)

      expect(createMany).not.toHaveBeenCalled()
      expect(updateMany).toHaveBeenCalledTimes(1)
      expect(updateMany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               id: 'acc1',
               status: 'ACTIVE',
            },
         })
      )
   })
})
