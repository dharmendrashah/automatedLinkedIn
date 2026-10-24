import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Prisma } from 'generated/prisma/client'

import { MESSAGES_FINISHED_LABEL, MESSAGES_NEXT_SKIP_LABEL, type TaskResult } from '@automatedLinkedIn/contracts'

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
const result = (verdict: string, nextSkip?: string, finished = false) =>
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
                     {
                        label: MESSAGES_FINISHED_LABEL,
                        value: finished ? 'Yes' : 'No',
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
      findUnique.mockReset().mockResolvedValue({ messagesBackfilledAt: null })
      findSession.mockReset().mockResolvedValue({ requestParams: { input: { limit: 50 } } })

      await linkedInMessagesHooks.onResult?.(session, result('DONE'), tx)
      await linkedInMessagesHooks.onResult?.(session, result('PARTIAL', '14'), tx)

      expect(createMany).toHaveBeenCalledTimes(2)
      expect(createMany).toHaveBeenCalledWith({
         data: [{ sessionId: 's1' }],
         skipDuplicates: true,
      })
   })

   describe('the first read of an account', () => {
      const saved = () => updateMany.mock.calls.at(-1)?.[0]

      beforeEach(() => {
         createMany.mockReset().mockResolvedValue({ count: 1 })
         updateMany.mockReset().mockResolvedValue({ count: 1 })
         findUnique.mockReset().mockResolvedValue({ messagesBackfilledAt: null })
         findSession.mockReset().mockResolvedValue({ requestParams: { input: { skip: 50 } } })
      })

      it('should go on from the place after the last row gone through, in half an hour, when the list did not end', async () => {
         await linkedInMessagesHooks.onResult?.(session, result('DONE', '100'), tx)

         expect(saved()).toEqual({
            where: { id: 'acc1' },
            data: {
               messagesReadAt: expect.any(Date),
               messagesResumeSkip: 100,
               nextMessagesAt: expect.any(Date),
            },
         })

         const { nextMessagesAt } = saved().data

         expect(nextMessagesAt.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000)
         expect(nextMessagesAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60 * 1000)
      })

      it('should be marked done, with nothing pending and no sweep due yet, when the list ended', async () => {
         await linkedInMessagesHooks.onResult?.(session, result('DONE', '63', true), tx)

         expect(saved().data).toEqual({
            messagesReadAt: expect.any(Date),
            messagesResumeSkip: null,
            messagesBackfilledAt: expect.any(Date),
            messagesSweptAt: expect.any(Date),
         })
      })

      it('should keep the place it had when the run says no usable place', async () => {
         await linkedInMessagesHooks.onResult?.(session, result('PARTIAL', '50'), tx)
         await linkedInMessagesHooks.onResult?.(session, result('PARTIAL', 'soon'), tx)
         findSession.mockResolvedValue(null)
         await linkedInMessagesHooks.onResult?.(session, result('PARTIAL', '90'), tx)

         for (const [{ data }] of updateMany.mock.calls) {
            expect(data).toEqual({ messagesReadAt: expect.any(Date) })
         }
      })
   })

   describe('a later read', () => {
      const saved = () => updateMany.mock.calls.at(-1)?.[0]

      beforeEach(() => {
         createMany.mockReset().mockResolvedValue({ count: 1 })
         updateMany.mockReset().mockResolvedValue({ count: 1 })
         findUnique.mockReset().mockResolvedValue({ messagesBackfilledAt: new Date() })
      })

      it('should go on at once from where it stopped, when it did not reach the rows it knew', async () => {
         findSession.mockResolvedValue({
            requestParams: {
               input: {
                  skip: 0,
                  stopAfterKnown: 3,
               },
            },
         })

         await linkedInMessagesHooks.onResult?.(session, result('PARTIAL', '14'), tx)

         expect(saved().data).toEqual({
            messagesReadAt: expect.any(Date),
            messagesResumeSkip: 14,
            nextMessagesAt: expect.any(Date),
         })
         expect(saved().data.nextMessagesAt.getTime()).toBeLessThanOrEqual(Date.now())
      })

      it('should clear the place when it reached the rows it knew', async () => {
         findSession.mockResolvedValue({ requestParams: { input: { stopAfterKnown: 3 } } })

         await linkedInMessagesHooks.onResult?.(session, result('DONE', '4', true), tx)

         expect(saved().data).toEqual({
            messagesReadAt: expect.any(Date),
            messagesResumeSkip: null,
         })
      })

      it('should change no place when it was a sweep, which does not stop at known rows', async () => {
         findSession.mockResolvedValue({ requestParams: { input: { limit: 20 } } })

         await linkedInMessagesHooks.onResult?.(session, result('DONE', '20'), tx)

         expect(saved().data).toEqual({ messagesReadAt: expect.any(Date) })
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
