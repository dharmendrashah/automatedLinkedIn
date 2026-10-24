import { describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInProfileHooks } from './linkedInProfile.hooks'
import { TaskRefusedError } from './taskErrors'

const findUnique = vi.fn()
const updateMany = vi.fn()
const createMany = vi.fn()
const tx = {
   linkedInAccount: {
      findUnique,
      updateMany,
   },
   profileImport: { createMany },
} as unknown as Prisma.TransactionClient

const request = (trigger: 'manual' | 'automatic') => ({
   id: 's1',
   userId: 'u1',
   accountId: 'acc1',
   task: 'linkedin-profile',
   trigger,
})

const session = {
   id: 's1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}

describe('linkedin-profile onRequest', () => {
   it('should refuse an account that is not signed in, and ask for nothing', async () => {
      findUnique.mockReset().mockResolvedValue({ status: 'NEEDS_REAUTH' })
      updateMany.mockReset()

      await expect(linkedInProfileHooks.onRequest?.(request('manual'), tx)).rejects.toBeInstanceOf(TaskRefusedError)
      expect(updateMany).not.toHaveBeenCalled()
   })

   it('should note the first ask of a signed in account, for the button and for the first visit', async () => {
      findUnique.mockReset().mockResolvedValue({ status: 'ACTIVE' })
      updateMany.mockReset().mockResolvedValue({ count: 1 })

      await expect(linkedInProfileHooks.onRequest?.(request('manual'), tx)).resolves.toBeUndefined()
      await expect(linkedInProfileHooks.onRequest?.(request('automatic'), tx)).resolves.toBeUndefined()

      expect(updateMany).toHaveBeenCalledWith({
         where: {
            id: 'acc1',
            profileAskedAt: null,
         },
         data: { profileAskedAt: expect.any(Date) },
      })
   })

   it('should refuse an automatic read when the profile was already asked for, but let the button through', async () => {
      findUnique.mockReset().mockResolvedValue({ status: 'ACTIVE' })
      updateMany.mockReset().mockResolvedValue({ count: 0 })

      await expect(linkedInProfileHooks.onRequest?.(request('automatic'), tx)).rejects.toBeInstanceOf(TaskRefusedError)
      await expect(linkedInProfileHooks.onRequest?.(request('manual'), tx)).resolves.toBeUndefined()
   })
})

describe('linkedin-profile onResult', () => {
   const result = (verdict: string) => ({ verdict }) as TaskResult

   it('should queue the file of a run that read something, once', async () => {
      createMany.mockReset().mockResolvedValue({ count: 1 })

      await linkedInProfileHooks.onResult?.(session, result('DONE'), tx)
      await linkedInProfileHooks.onResult?.(session, result('PARTIAL'), tx)

      expect(createMany).toHaveBeenCalledTimes(2)
      expect(createMany).toHaveBeenCalledWith({
         data: [{ sessionId: 's1' }],
         skipDuplicates: true,
      })
   })

   it('should queue nothing when the run read nothing', async () => {
      createMany.mockReset()
      updateMany.mockReset().mockResolvedValue({ count: 1 })

      await linkedInProfileHooks.onResult?.(session, result('ERROR'), tx)
      await linkedInProfileHooks.onResult?.(session, result('NEEDS_PROXY'), tx)

      expect(createMany).not.toHaveBeenCalled()
      expect(updateMany).not.toHaveBeenCalled()
   })

   it('should bring the sign-in check forward when the run was signed out', async () => {
      createMany.mockReset()
      updateMany.mockReset().mockResolvedValue({ count: 1 })

      await linkedInProfileHooks.onResult?.(session, result('SIGNED_OUT'), tx)

      expect(createMany).not.toHaveBeenCalled()
      expect(updateMany).toHaveBeenCalledWith({
         where: {
            id: 'acc1',
            status: 'ACTIVE',
         },
         data: { nextCheckAt: expect.any(Date) },
      })
   })
})
