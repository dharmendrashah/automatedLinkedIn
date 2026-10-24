import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { MESSAGES_FINISHED_LABEL, MESSAGES_NEXT_SKIP_LABEL, type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInMessagesHooks } from './linkedInMessages.hooks'
import { messagesInput, sweepDue } from './messagesRefresh'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. The worker is taken to have announced the version of the task that reads rows.
vi.mock('./task.service', () => ({
   TaskService: {
      catalog: async () => [
         {
            task: 'linkedin-messages',
            version: 3,
         },
      ],
   },
}))

const email = `${randomUUID()}@elitale.com`

let userId: string
let accountId: string

const account = () =>
   PrismaService.client.linkedInAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: {
         id: true,
         messagesReadAt: true,
         messagesBackfilledAt: true,
         messagesSweptAt: true,
         messagesResumeSkip: true,
         nextMessagesAt: true,
      },
   })

// One run of the messages task as the brain saves it, finished by the hook in its own transaction: what it was asked for, and
// what it says of where it got to.
const finish = async (verdict: 'DONE' | 'PARTIAL', next: number, finished = false) => {
   const input = await messagesInput(await account())
   const id = randomUUID()

   await PrismaService.client.spiderSession.create({
      data: {
         id,
         userId,
         linkedInAccountId: accountId,
         kind: 'TASK',
         task: 'linkedin-messages',
         trigger: 'automatic',
         requestParams: {
            action: 'TASK',
            task: 'linkedin-messages',
            input,
         },
      },
   })

   const result = {
      verdict,
      report: {
         headline: 'Read.',
         sections: [
            {
               title: 'Messages',
               items: [
                  {
                     label: MESSAGES_NEXT_SKIP_LABEL,
                     value: String(next),
                  },
                  {
                     label: MESSAGES_FINISHED_LABEL,
                     value: finished ? 'Yes' : 'No',
                  },
               ],
            },
         ],
      },
   } as TaskResult

   await PrismaService.client.$transaction(async tx => {
      await linkedInMessagesHooks.onResult?.(
         {
            id,
            userId,
            linkedInAccountId: accountId,
         },
         result,
         tx
      )
   })

   return input
}

describe('linkedin-messages hooks (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: 'x',
               secretIv: 'x',
               secretTag: 'x',
            },
         })
      ).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should walk the inbox batch after batch until the list ends, then read only what is new, and sweep once a day', async () => {
      // 50 places of the first read are gone through (some read, some left alone); the next batch starts after them, in half an hour.
      await expect(finish('DONE', 50)).resolves.toEqual({
         limit: 50,
         known: [],
      })
      await expect(account()).resolves.toMatchObject({
         messagesBackfilledAt: null,
         messagesResumeSkip: 50,
      })

      // A batch is cut short at 71; the next goes on from there.
      await expect(finish('PARTIAL', 71)).resolves.toEqual({
         skip: 50,
         limit: 50,
         known: [],
      })
      await expect(account()).resolves.toMatchObject({ messagesResumeSkip: 71 })

      // The list ends at 90: the first read is done, nothing is pending, and no sweep is due yet.
      await expect(finish('DONE', 90, true)).resolves.toEqual({
         skip: 71,
         limit: 50,
         known: [],
      })

      const done = await account()

      expect(done).toMatchObject({ messagesResumeSkip: null })
      expect(done.messagesBackfilledAt).not.toBeNull()
      expect(sweepDue(done, new Date())).toBe(false)
      expect(sweepDue(done, new Date(Date.now() + 25 * 60 * 60 * 1000))).toBe(true)

      // From now on a read starts at the top and stops at the first rows it knows.
      await expect(messagesInput(done)).resolves.toEqual({
         limit: 50,
         known: [],
         stopAfterKnown: 3,
      })

      // One that did not reach them goes on at once from where it stopped, and one that did clears the place.
      await finish('PARTIAL', 12)
      await expect(account()).resolves.toMatchObject({ messagesResumeSkip: 12 })
      await expect(messagesInput(await account())).resolves.toMatchObject({
         skip: 12,
         stopAfterKnown: 3,
      })
      await finish('DONE', 15, true)
      await expect(account()).resolves.toMatchObject({ messagesResumeSkip: null })
   })

   it('should hand the rows of the newest conversations back, by the hash the spider made', async () => {
      const conversation = (linkedInId: string, rowHash: string | null, lastMessageAt: Date) => ({
         userId,
         accountId,
         linkedInId,
         title: 't',
         kind: 'DIRECT' as const,
         participants: [],
         unread: false,
         complete: true,
         rowHash,
         lastMessageAt,
      })

      await PrismaService.client.linkedInConversation.createMany({
         data: [
            conversation('old', 'aaaaaaaa', new Date('2026-10-01T10:00:00Z')),
            conversation('new', 'bbbbbbbb', new Date('2026-10-20T10:00:00Z')),
            conversation('none', null, new Date('2026-10-22T10:00:00Z')),
         ],
      })

      await expect(messagesInput(await account())).resolves.toMatchObject({ known: ['bbbbbbbb', 'aaaaaaaa'] })
   })
})
