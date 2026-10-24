import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { MESSAGES_NEXT_SKIP_LABEL, type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInMessagesHooks } from './linkedInMessages.hooks'
import { TaskRefusedError } from './taskErrors'

const findUnique = vi.fn()
const updateMany = vi.fn()
const createMany = vi.fn()
const findSession = vi.fn()
const tx = {
   linkedInAccount: {
      findUnique,
      updateMany,
   },
   messageImport: { createMany },
   spiderSession: { findUnique: findSession },
} as unknown as Prisma.TransactionClient

const session = {
   id: 's1',
   userId: 'u1',
   linkedInAccountId: 'acc1',
}
const result = (verdict: string, nextSkip?: string) =>
   ({
      verdict,
      ...(nextSkip && {
         report: {
            headline: 'Read part.',
            sections: [
               {
                  title: 'Messages',
                  items: [
                     {
                        label: 'Conversations',
                        value: '14',
                     },
                     {
                        label: MESSAGES_NEXT_SKIP_LABEL,
                        value: nextSkip,
                     },
                  ],
               },
            ],
         },
      }),
   }) as TaskResult

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
      updateMany.mockReset().mockResolvedValue({ count: 1 })
      findSession.mockReset().mockResolvedValue({ requestParams: { input: { limit: 50 } } })

      await linkedInMessagesHooks.onResult?.(session, result('DONE'), tx)
      await linkedInMessagesHooks.onResult?.(session, result('PARTIAL', '14'), tx)

      expect(createMany).toHaveBeenCalledTimes(2)
      expect(createMany).toHaveBeenCalledWith({
         data: [{ sessionId: 's1' }],
         skipDuplicates: true,
      })
   })

   describe('a batch that was only partly read', () => {
      const pending = () => updateMany.mock.calls.at(-1)?.[0]

      beforeEach(() => {
         createMany.mockReset().mockResolvedValue({ count: 1 })
         updateMany.mockReset().mockResolvedValue({ count: 1 })
         findSession.mockReset()
      })

      it('should be kept, from where the run stopped to where it was asked to end, and read again at the next pass', async () => {
         findSession.mockResolvedValue({ requestParams: { input: { limit: 50 } } })

         await linkedInMessagesHooks.onResult?.(session, result('PARTIAL', '14'), tx)

         expect(pending()).toEqual({
            where: { id: 'acc1' },
            data: {
               messagesResumeSkip: 14,
               messagesResumeUntil: 50,
               nextMessagesAt: expect.any(Date),
            },
         })
      })

      it('should end where the first run of the batch began, also when it is the third run', async () => {
         findSession.mockResolvedValue({
            requestParams: {
               input: {
                  skip: 30,
                  limit: 20,
               },
            },
         })

         await linkedInMessagesHooks.onResult?.(session, result('PARTIAL', '41'), tx)

         expect(pending()?.data).toMatchObject({
            messagesResumeSkip: 41,
            messagesResumeUntil: 50,
         })
      })

      it('should be cleared when a run read everything it was asked for', async () => {
         await linkedInMessagesHooks.onResult?.(session, result('DONE', '50'), tx)

         expect(pending()).toEqual({
            where: { id: 'acc1' },
            data: {
               messagesResumeSkip: null,
               messagesResumeUntil: null,
            },
         })
      })

      it.each([
         ['says no place', undefined],
         ['says a place that is not a number', 'soon'],
         ['says a place that does not move forward', '0'],
         ['says a place past the end of the batch', '50'],
      ])('should not go on blindly when the run %s', async (_name, place) => {
         findSession.mockResolvedValue({ requestParams: { input: { limit: 50 } } })

         await linkedInMessagesHooks.onResult?.(session, result('PARTIAL', place), tx)

         expect(pending()?.data).toEqual({
            messagesResumeSkip: null,
            messagesResumeUntil: null,
         })
      })

      it('should not go on when the input the run was given cannot be read', async () => {
         findSession.mockResolvedValue(null)

         await linkedInMessagesHooks.onResult?.(session, result('PARTIAL', '14'), tx)

         expect(pending()?.data).toEqual({
            messagesResumeSkip: null,
            messagesResumeUntil: null,
         })
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
