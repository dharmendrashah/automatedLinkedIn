import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CryptoService } from 'core'

import { LinkedInConversationService } from './linkedInConversation.service'
import { MessageImportService } from './messageImport.service'
import { PrismaService } from './prisma.service'
import { SpiderSessionService } from './spiderSession.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

const email = `${randomUUID()}@elitale.com`

const files = (conversationId: string) =>
   JSON.stringify({
      contract: 1,
      part: 1,
      captured_at: '2026-10-22T12:00:00.000Z',
      account: { name: 'Tripti Verma' },
      conversations: [
         {
            id: conversationId,
            title: 'Ada Lovelace',
            kind: 'DIRECT',
            participants: [{ name: 'Ada Lovelace' }],
            unread: true,
            lastActivity: 'Oct 22',
            complete: true,
            messages: [
               {
                  id: 'm1',
                  sender: { name: 'Ada Lovelace' },
                  direction: 'THEM',
                  date: '2026-10-22',
                  time: '09:00',
                  when: '9:00 AM',
                  text: 'Hello',
                  attachments: [],
               },
            ],
         },
      ],
   })

let userId: string
let accountId: string

const startRun = async (id: string) => {
   await SpiderSessionService.startTask({
      id,
      userId,
      linkedInAccountId: accountId,
      task: 'linkedin-messages',
      taskVersion: 2,
      trigger: 'manual',
      input: {},
      startedAt: new Date(),
   })
   await PrismaService.client.spiderSessionArtifact.create({
      data: {
         sessionId: id,
         kind: 'file',
         name: 'messages.json',
         path: `runs/linkedin-messages/${userId}/2026/10/22/${id}/files/messages.json`,
         contentType: 'application/json',
         bytes: 10,
      },
   })
   // A second in the past: the row's time comes from this process and "due" is read on the database clock, which can lag by a few ms.
   await PrismaService.client.messageImport.create({
      data: {
         sessionId: id,
         nextAttemptAt: new Date(Date.now() - 1000),
      },
   })
}

describe('MessageImportService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id

      const sealed = CryptoService.seal('{}')

      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
            },
         })
      ).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should store the files of a run that is due, once, for the owner of the session', async () => {
      const id = randomUUID()
      const read = async () => files('2-ada')

      await startRun(id)

      await expect(MessageImportService.importDue(undefined, read)).resolves.toMatchObject({ done: 1 })
      await expect(MessageImportService.importDue(undefined, read)).resolves.toEqual({
         done: 0,
         retried: 0,
         failed: 0,
      })

      const [conversation] = await LinkedInConversationService.list(userId)

      expect(conversation).toMatchObject({
         title: 'Ada Lovelace',
         unread: true,
         messageCount: 1,
      })
      await expect(PrismaService.client.messageImport.findUnique({ where: { sessionId: id } })).resolves.toMatchObject({
         status: 'DONE',
         claimedUntil: null,
      })
      await expect(LinkedInConversationService.accounts(userId)).resolves.toMatchObject([
         { displayName: 'Tripti Verma' },
      ])
   })

   it('should try a failed import again later and keep only the kind of failure', async () => {
      const id = randomUUID()

      await startRun(id)

      await expect(
         MessageImportService.importDue(undefined, async () => {
            throw new Error('the text of a message')
         })
      ).resolves.toMatchObject({ retried: 1 })

      const row = await PrismaService.client.messageImport.findUnique({ where: { sessionId: id } })

      expect(row).toMatchObject({
         status: 'PENDING',
         attempts: 1,
         lastError: 'Error',
         claimedUntil: null,
      })
      expect(row?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
      // Not due yet, so a second pass leaves it alone.
      await expect(MessageImportService.importDue(undefined, async () => files('2-x'))).resolves.toEqual({
         done: 0,
         retried: 0,
         failed: 0,
      })
   })

   it('should not let two workers take one import: a claimed row is skipped', async () => {
      const id = randomUUID()

      await startRun(id)
      await PrismaService.client.$executeRawUnsafe(
         `UPDATE "MessageImport" SET "claimedUntil" = timezone('UTC', now()) + interval '5 minutes' WHERE "sessionId" = '${id}'`
      )

      await expect(MessageImportService.importDue(undefined, async () => files('2-y'))).resolves.toEqual({
         done: 0,
         retried: 0,
         failed: 0,
      })
   })
})
