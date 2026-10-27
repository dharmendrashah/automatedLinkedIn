import { describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInInvitationHooks } from './linkedInInvitation.hooks'
import { TaskRefusedError } from './taskErrors'

const session = {
   id: 's1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}

const finish = async (verdict: string) => {
   const invitations = vi.fn()
   const account = vi.fn()
   const imports = vi.fn()

   await linkedInInvitationHooks.onResult?.(
      session,
      {
         verdict,
         message: 'A sentence.',
      } as TaskResult,
      {
         linkedInInvitation: { updateMany: invitations },
         linkedInAccount: { updateMany: account },
         invitationImport: { createMany: imports },
      } as unknown as Prisma.TransactionClient
   )

   return {
      invitations,
      account,
      imports,
   }
}

describe('linkedin-invitations hooks', () => {
   it('should refuse a request for an account that is not signed in, and let one that is through', async () => {
      const request = {
         id: 's1',
         userId: 'u1',
         accountId: 'acc1',
         task: 'linkedin-invitations',
         trigger: 'manual' as const,
      }
      const findUnique = vi
         .fn()
         .mockResolvedValueOnce({ status: 'NEEDS_REAUTH' })
         .mockResolvedValueOnce({ status: 'ACTIVE' })
      const tx = { linkedInAccount: { findUnique } } as unknown as Prisma.TransactionClient

      await expect(linkedInInvitationHooks.onRequest?.(request, tx)).rejects.toBeInstanceOf(TaskRefusedError)
      await expect(linkedInInvitationHooks.onRequest?.(request, tx)).resolves.toBeUndefined()
   })

   it('should end the queued answers of the run as failed when the verdict says nothing was clicked', async () => {
      const { invitations } = await finish('ERROR')

      expect(invitations).toHaveBeenCalledWith({
         where: {
            sessionId: 's1',
            status: 'QUEUED',
         },
         data: {
            status: 'FAILED',
            failure: 'A sentence.',
         },
      })
   })

   it('should end them as unsure for any other verdict, since a click may have landed', async () => {
      for (const verdict of ['UNKNOWN', 'TIMED_OUT', 'DONE']) {
         const { invitations } = await finish(verdict)

         expect(invitations.mock.calls[0]?.[0].data.status).toBe('UNKNOWN')
      }
   })

   it('should queue the file of a run that can have one to be stored, and nothing for a run that cannot', async () => {
      for (const verdict of ['DONE', 'PARTIAL', 'UNKNOWN', 'SIGNED_OUT']) {
         expect((await finish(verdict)).imports).toHaveBeenCalledWith({
            data: [{ sessionId: 's1' }],
            skipDuplicates: true,
         })
      }

      expect((await finish('TIMED_OUT')).imports).not.toHaveBeenCalled()
   })

   it('should ask for a sign-in check when LinkedIn said signed out', async () => {
      const { account } = await finish('SIGNED_OUT')

      expect(account).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               id: 'acc1',
               status: 'ACTIVE',
            },
         })
      )
      expect((await finish('DONE')).account).not.toHaveBeenCalled()
   })
})
