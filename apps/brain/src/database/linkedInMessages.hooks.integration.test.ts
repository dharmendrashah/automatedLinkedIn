import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MESSAGES_NEXT_SKIP_LABEL, type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInMessagesHooks } from './linkedInMessages.hooks'
import { messagesInput } from './messagesRefresh'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`

let userId: string
let accountId: string

const account = () =>
   PrismaService.client.linkedInAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: {
         messagesReadAt: true,
         messagesResumeSkip: true,
         messagesResumeUntil: true,
         nextMessagesAt: true,
      },
   })

// One run of the messages task as the brain saves it, finished by the hook in its own transaction.
const finish = async (verdict: 'DONE' | 'PARTIAL', nextSkip: number) => {
   const input = messagesInput(await account())
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
                     value: String(nextSkip),
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

   it('should go on after each partly read run, to the end of the batch, until a run reads it all', async () => {
      // 14 of the 50 of the first read.
      await expect(finish('PARTIAL', 14)).resolves.toEqual({ limit: 50 })
      await expect(account()).resolves.toMatchObject({
         messagesResumeSkip: 14,
         messagesResumeUntil: 50,
      })
      expect((await account()).nextMessagesAt).not.toBeNull()

      // The next run skips them and asks for the other 36; it reads 16 more.
      await expect(finish('PARTIAL', 30)).resolves.toEqual({
         skip: 14,
         limit: 36,
      })
      await expect(account()).resolves.toMatchObject({
         messagesResumeSkip: 30,
         messagesResumeUntil: 50,
      })

      // The last 20 are read: nothing is pending, and the next read is an ordinary one.
      await expect(finish('DONE', 50)).resolves.toEqual({
         skip: 30,
         limit: 20,
      })
      await expect(account()).resolves.toMatchObject({
         messagesResumeSkip: null,
         messagesResumeUntil: null,
      })
      expect(messagesInput(await account())).toEqual({ limit: 50 })
   })
})
