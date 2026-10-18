import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInBrowseHooks } from './linkedInBrowse.hooks'

const updateMany = vi.fn()
const tx = { linkedInAccount: { updateMany } } as unknown as Prisma.TransactionClient
const session = {
   id: 's1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}

const result = (verdict: string) => ({ verdict }) as TaskResult

describe('linkedin-browse hooks', () => {
   beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-19T10:00:00Z') })
      updateMany.mockReset().mockResolvedValue({ count: 1 })
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('should bring the sign-in check of an active account forward when the visit found it signed out', async () => {
      await linkedInBrowseHooks.onResult?.(session, result('SIGNED_OUT'), tx)

      expect(updateMany).toHaveBeenCalledWith({
         where: {
            id: 'acc1',
            status: 'ACTIVE',
         },
         data: { nextCheckAt: new Date('2026-10-19T10:00:00Z') },
      })
   })

   it('should change nothing on the account after any other answer', async () => {
      await linkedInBrowseHooks.onResult?.(session, result('DONE'), tx)
      await linkedInBrowseHooks.onResult?.(session, result('CRASHED'), tx)

      expect(updateMany).not.toHaveBeenCalled()
   })
})
