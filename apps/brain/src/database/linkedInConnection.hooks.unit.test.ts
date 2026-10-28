import { describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInConnectionHooks } from './linkedInConnection.hooks'
import { TaskRefusedError } from './taskErrors'

const session = {
   id: 's1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}

const finish = async (verdict: string) => {
   const connections = vi.fn()
   const account = vi.fn()
   const imports = vi.fn()

   await linkedInConnectionHooks.onResult?.(
      session,
      {
         verdict,
         message: 'A sentence.',
      } as TaskResult,
      {
         linkedInConnection: { updateMany: connections },
         linkedInAccount: { updateMany: account },
         connectionImport: { createMany: imports },
      } as unknown as Prisma.TransactionClient
   )

   return {
      connections,
      account,
      imports,
   }
}

describe('linkedin-connections hooks', () => {
   it('should refuse a request for an account that is not signed in, and let one that is through', async () => {
      const request = {
         id: 's1',
         userId: 'u1',
         accountId: 'acc1',
         task: 'linkedin-connections',
         trigger: 'manual' as const,
      }
      const findUnique = vi
         .fn()
         .mockResolvedValueOnce({ status: 'NEEDS_REAUTH' })
         .mockResolvedValueOnce({ status: 'ACTIVE' })
      const tx = { linkedInAccount: { findUnique } } as unknown as Prisma.TransactionClient

      await expect(linkedInConnectionHooks.onRequest?.(request, tx)).rejects.toBeInstanceOf(TaskRefusedError)
      await expect(linkedInConnectionHooks.onRequest?.(request, tx)).resolves.toBeUndefined()
   })

   it('should end the removal of the run as failed when the verdict says nothing was pressed', async () => {
      const { connections } = await finish('ERROR')

      expect(connections).toHaveBeenCalledWith({
         where: {
            sessionId: 's1',
            status: 'REMOVING',
         },
         data: {
            status: 'FAILED',
            failure: 'A sentence.',
         },
      })
   })

   it('should end it as unsure for any other verdict, since Remove may have been pressed', async () => {
      for (const verdict of ['UNKNOWN', 'TIMED_OUT', 'DONE']) {
         const { connections } = await finish(verdict)

         expect(connections.mock.calls[0]?.[0].data.status).toBe('UNKNOWN')
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
