import { describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInInviteHooks } from './linkedInInvite.hooks'

const session = {
   id: 's1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}

const finish = async (verdict: string) => {
   const invites = vi.fn()
   const update = vi.fn()
   const updateMany = vi.fn()
   const imports = vi.fn()

   await linkedInInviteHooks.onResult?.(
      session,
      {
         verdict,
         message: 'A sentence.',
      } as TaskResult,
      {
         linkedInInvite: {
            updateMany: invites,
            findFirst: vi.fn().mockResolvedValue(null),
         },
         linkedInAccount: {
            update,
            updateMany,
         },
         inviteImport: { createMany: imports },
      } as unknown as Prisma.TransactionClient
   )

   return {
      invites,
      update,
      updateMany,
      imports,
   }
}

describe('linkedin-invite hooks', () => {
   it('should put the run back in the queue when nothing was pressed, and queue no file', async () => {
      const { invites, imports, update } = await finish('NOT_STARTED')

      expect(invites).toHaveBeenCalledWith({
         where: {
            sessionId: 's1',
            state: 'SENDING',
         },
         data: {
            state: 'QUEUED',
            tries: { increment: 1 },
         },
      })
      expect(imports).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
   })

   it('should call the invites of a run that pressed unsure until its file settles them', async () => {
      const { invites, imports } = await finish('PARTIAL')

      expect(invites).toHaveBeenCalledWith(
         expect.objectContaining({ data: expect.objectContaining({ state: 'UNKNOWN' }) })
      )
      expect(imports).toHaveBeenCalledWith({
         data: [{ sessionId: 's1' }],
         skipDuplicates: true,
      })
   })

   it('should stop the account until its next sign-in when signed out, and ask for the sign-in check', async () => {
      const { update, updateMany } = await finish('SIGNED_OUT')

      expect(update).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               invitesStopUntil: null,
               invitesStopReason: expect.stringContaining('signed the account out'),
            }),
         })
      )
      expect(updateMany).toHaveBeenCalledWith(
         expect.objectContaining({ data: expect.objectContaining({ nextCheckAt: expect.any(Date) }) })
      )
   })

   it("should stop the account for a week at LinkedIn's limit", async () => {
      const { update } = await finish('LIMIT_REACHED')
      const [[{ data }]] = update.mock.calls as Array<[{ data: { invitesStopUntil: Date } }]>

      expect(data.invitesStopUntil.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000)
   })
})
