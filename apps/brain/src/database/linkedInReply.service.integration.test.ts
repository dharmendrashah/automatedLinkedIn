import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { KeptFiles, UploadFiles, UploadRefused } from 'core'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInReplyHooks } from './linkedInReply.hooks'
import { LinkedInReplyService, REPLY_LIMITS } from './linkedInReply.service'
import { PrismaService } from './prisma.service'
import { SpiderSessionService } from './spiderSession.service'
import { TaskService } from './task.service'
import { TaskRefusedError } from './taskErrors'
import { UserService } from './user.service'

// Needs PostgreSQL. The task itself is not started: `TaskService.request` is replaced by a stand-in that saves what the service
// asks to save in the run's transaction, as the real one does.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

let userId: string
let otherUserId: string
let accountId: string
let conversationId: string
let otherConversationId: string

const account = (id: string) =>
   PrismaService.client.linkedInAccount.create({
      data: {
         userId: id,
         email: `${randomUUID()}@example.com`,
         secret: 'x',
         secretIv: 'x',
         secretTag: 'x',
      },
   })

const conversation = (id: string, forAccountId: string, linkedInId: string) =>
   PrismaService.client.linkedInConversation.create({
      data: {
         userId: id,
         accountId: forAccountId,
         linkedInId,
         title: 'Ada Lovelace',
         kind: 'DIRECT',
         participants: [],
         unread: false,
         complete: false,
      },
   })

const finish = (sessionId: string, verdict: string, message = 'Done.') =>
   PrismaService.client.$transaction(async tx => {
      await linkedInReplyHooks.onResult?.(
         {
            id: sessionId,
            userId,
            linkedInAccountId: accountId,
         },
         {
            verdict,
            message,
         } as TaskResult,
         tx
      )
   })

const sessionOf = async (id: string | undefined) => {
   const where = { id: id ?? '' }
   const reply = await PrismaService.client.linkedInReply.findUniqueOrThrow({ where })

   return reply.sessionId
}

const startRun = (id: string) =>
   SpiderSessionService.startTask({
      id,
      userId,
      linkedInAccountId: accountId,
      task: 'linkedin-reply',
      taskVersion: 1,
      trigger: 'manual',
      input: {},
      startedAt: new Date(),
   })

const requested: Array<{ task: string; input: Record<string, unknown> }> = []

describe('LinkedInReplyService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      accountId = (await account(userId)).id
      conversationId = (await conversation(userId, accountId, '2-ada')).id
      otherConversationId = (await conversation(otherUserId, (await account(otherUserId)).id, '2-eve')).id
   })

   beforeEach(async () => {
      await PrismaService.client.linkedInReply.deleteMany({ where: { userId } })
      requested.length = 0
      vi.spyOn(TaskService, 'request').mockImplementation(async options => {
         const id = randomUUID()

         requested.push({
            task: options.task,
            input: options.input ?? {},
         })
         await startRun(id)
         await PrismaService.client.$transaction(async tx => {
            await options.onStart?.(id, tx)
         })

         return { id }
      })
   })

   afterAll(async () => {
      vi.restoreAllMocks()
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should start the reply task for the conversation and keep the reply with its run', async () => {
      const sent = await LinkedInReplyService.send(userId, conversationId, '  Tomorrow at ten.  ')

      expect(requested).toEqual([
         {
            task: 'linkedin-reply',
            input: {
               thread: '2-ada',
               title: 'Ada Lovelace',
               text: 'Tomorrow at ten.',
            },
         },
      ])
      await expect(LinkedInReplyService.get(userId, sent?.id ?? '')).resolves.toMatchObject({
         state: 'SENDING',
         conversationId,
         failure: null,
      })
   })

   it('should answer like a missing conversation for a conversation of someone else', async () => {
      await expect(LinkedInReplyService.send(userId, otherConversationId, 'Hi')).resolves.toBeNull()
      expect(requested).toEqual([])
   })

   it('should hide a reply from anyone but its owner', async () => {
      const sent = await LinkedInReplyService.send(userId, conversationId, 'Hi')

      await expect(LinkedInReplyService.get(otherUserId, sent?.id ?? '')).resolves.toBeNull()
   })

   it('should let the owner dismiss a reply that did not go, once, and never one that is being sent, went or is not theirs', async () => {
      const row = (state: 'FAILED' | 'UNKNOWN' | 'SENDING' | 'SENT') => ({
         userId,
         accountId,
         conversationId,
         text: 'x',
         state,
         sessionId: randomUUID(),
      })
      const [failed, unsure, sending, sent] = await Promise.all(
         (['FAILED', 'UNKNOWN', 'SENDING', 'SENT'] as const).map(state =>
            PrismaService.client.linkedInReply.create({ data: row(state) })
         )
      )

      await expect(LinkedInReplyService.dismiss(userId, failed?.id ?? '')).resolves.toBe(true)
      await expect(LinkedInReplyService.dismiss(userId, unsure?.id ?? '')).resolves.toBe(true)
      await expect(LinkedInReplyService.dismiss(userId, sending?.id ?? '')).resolves.toBe(false)
      await expect(LinkedInReplyService.dismiss(userId, sent?.id ?? '')).resolves.toBe(false)
      await expect(LinkedInReplyService.dismiss(otherUserId, failed?.id ?? '')).resolves.toBe(false)
      await expect(
         PrismaService.client.linkedInReply.findUniqueOrThrow({ where: { id: failed?.id ?? '' } })
      ).resolves.toMatchObject({ dismissedAt: expect.any(Date) })
   })

   it('should refuse a second reply while one is being sent from the account, by the database too', async () => {
      await LinkedInReplyService.send(userId, conversationId, 'One')

      await expect(LinkedInReplyService.send(userId, conversationId, 'Two')).rejects.toBeInstanceOf(TaskRefusedError)
      // Past the service's own check, the unique index still stops it.
      await expect(
         PrismaService.client.linkedInReply.create({
            data: {
               userId,
               accountId,
               conversationId,
               text: 'Two',
               sessionId: randomUUID(),
            },
         })
      ).rejects.toMatchObject({ code: 'P2002' })
   })

   it('should make the owner wait the quiet time between two replies, and let the next one through after it', async () => {
      const first = await LinkedInReplyService.send(userId, conversationId, 'One')

      await finish(await sessionOf(first?.id), 'SENT')

      await expect(LinkedInReplyService.send(userId, conversationId, 'Two')).rejects.toThrow(/Wait \d+ seconds/)

      await PrismaService.client.linkedInReply.updateMany({
         where: { userId },
         data: { createdAt: new Date(Date.now() - REPLY_LIMITS.gapMs - 1000) },
      })

      await expect(LinkedInReplyService.send(userId, conversationId, 'Two')).resolves.not.toBeNull()
   })

   it('should stop at the replies of the day, counting the ones that may have gone and not the ones that did not', async () => {
      const day = Date.now() - 2 * REPLY_LIMITS.gapMs
      const row = (state: 'SENT' | 'FAILED', index: number) => ({
         userId,
         accountId,
         conversationId,
         text: 'x',
         state,
         sessionId: randomUUID(),
         createdAt: new Date(day - index * 1000),
      })

      await PrismaService.client.linkedInReply.createMany({
         data: [
            ...Array.from({ length: REPLY_LIMITS.perDay - 1 }, (_, index) => row('SENT', index)),
            row('FAILED', 99),
         ],
      })

      await expect(LinkedInReplyService.send(userId, conversationId, 'Last one')).resolves.not.toBeNull()

      await PrismaService.client.linkedInReply.updateMany({
         where: {
            userId,
            state: 'SENDING',
         },
         data: { state: 'SENT' },
      })
      await PrismaService.client.linkedInReply.updateMany({
         where: { userId },
         data: { createdAt: new Date(day) },
      })

      await expect(LinkedInReplyService.send(userId, conversationId, 'One too many')).rejects.toThrow(
         /replies in 24 hours/
      )
   })

   it('should set the reply from the verdict of the run, and queue the page for storing unless nothing went', async () => {
      const cases = [
         ['SENT', 'SENT', 1],
         ['UNKNOWN', 'UNKNOWN', 1],
         ['TIMED_OUT', 'UNKNOWN', 1],
         ['WRONG_THREAD', 'FAILED', 0],
         ['NO_COMPOSER', 'FAILED', 0],
      ] as const

      for (const [verdict, state, imports] of cases) {
         const sessionId = randomUUID()

         await startRun(sessionId)
         await PrismaService.client.linkedInReply.create({
            data: {
               userId,
               accountId,
               conversationId,
               text: 'x',
               sessionId,
            },
         })
         await finish(sessionId, verdict, 'A sentence.')

         const reply = await PrismaService.client.linkedInReply.findUniqueOrThrow({ where: { sessionId } })

         expect([verdict, reply.state, reply.failure, reply.sentAt !== null]).toEqual([
            verdict,
            state,
            state === 'SENT' ? null : 'A sentence.',
            state === 'SENT',
         ])
         expect(await PrismaService.client.messageImport.count({ where: { sessionId } })).toBe(imports)
      }
   })

   it('should end a reply that never got an answer as unsure, and take the real answer if it comes later', async () => {
      const sent = await LinkedInReplyService.send(userId, conversationId, 'Hi')
      const sessionId = await sessionOf(sent?.id)

      await expect(LinkedInReplyService.endStale()).resolves.toBe(0)
      await expect(LinkedInReplyService.endStale(new Date(Date.now() + REPLY_LIMITS.staleMs + 1000))).resolves.toBe(1)
      await expect(LinkedInReplyService.get(userId, sent?.id ?? '')).resolves.toMatchObject({ state: 'UNKNOWN' })

      await finish(sessionId, 'SENT')

      await expect(LinkedInReplyService.get(userId, sent?.id ?? '')).resolves.toMatchObject({
         state: 'SENT',
         failure: null,
      })
   })

   it('should leave a reply that is already sent as sent when a late answer says otherwise', async () => {
      const sent = await LinkedInReplyService.send(userId, conversationId, 'Hi')
      const sessionId = await sessionOf(sent?.id)

      await finish(sessionId, 'SENT')
      await finish(sessionId, 'TIMED_OUT')

      await expect(LinkedInReplyService.get(userId, sent?.id ?? '')).resolves.toMatchObject({ state: 'SENT' })
   })

   describe('with files', () => {
      const UPLOAD = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'

      it('should start the reply with the files brain kept for the upload, not what the caller says, and allow no words', async () => {
         vi.spyOn(UploadFiles, 'verify').mockResolvedValue([
            {
               name: 'photo.png',
               bytes: 5,
            },
            {
               name: 'cv.pdf',
               bytes: 9,
            },
         ])

         const sent = await LinkedInReplyService.send(userId, conversationId, '', UPLOAD)
         const row = await PrismaService.client.linkedInReply.findUniqueOrThrow({ where: { id: sent?.id ?? '' } })

         expect(requested[0]?.input).toEqual({
            thread: '2-ada',
            title: 'Ada Lovelace',
            text: '',
            uploadId: UPLOAD,
            files: [
               {
                  name: 'photo.png',
                  kind: 'IMAGE',
               },
               {
                  name: 'cv.pdf',
                  kind: 'FILE',
               },
            ],
         })
         expect(row).toMatchObject({
            text: '',
            uploadId: UPLOAD,
            filesKeptAt: null,
            attachments: [
               {
                  name: 'photo.png',
                  kind: 'IMAGE',
                  bytes: 5,
               },
               {
                  name: 'cv.pdf',
                  kind: 'FILE',
                  bytes: 9,
               },
            ],
         })
      })

      it('should refuse the reply, with the sentence of the store, when a file is not what its name says it is', async () => {
         vi.spyOn(UploadFiles, 'verify').mockRejectedValue(
            new UploadRefused(415, 'A file is not what its name says it is.')
         )

         await expect(LinkedInReplyService.send(userId, conversationId, 'Hi', UPLOAD)).rejects.toThrow(
            'A file is not what its name says it is.'
         )
         expect(requested).toEqual([])
      })

      it('should hand out a signed form for a file of a type LinkedIn takes, with a safe name, and refuse any other type', async () => {
         const form = vi.spyOn(UploadFiles, 'form').mockResolvedValue({
            url: 'https://storage.googleapis.com/b/',
            fields: { key: 'k' },
            name: 'cv.pdf',
         })

         await expect(LinkedInReplyService.uploadForm(userId, UPLOAD, '../../My CV.pdf', 10)).resolves.toEqual({
            url: 'https://storage.googleapis.com/b/',
            fields: { key: 'k' },
            name: 'cv.pdf',
            kind: 'FILE',
         })
         expect(form).toHaveBeenCalledWith(userId, UPLOAD, 'My CV.pdf', 10)
         await expect(LinkedInReplyService.uploadForm(userId, UPLOAD, 'setup.exe', 10)).rejects.toBeInstanceOf(
            TaskRefusedError
         )

         form.mockRejectedValueOnce(new UploadRefused(413, 'The file is larger than a reply may carry.'))

         await expect(LinkedInReplyService.uploadForm(userId, UPLOAD, 'cv.pdf', 10)).rejects.toThrow(
            'The file is larger than a reply may carry.'
         )
      })

      it("should say a plain sentence, and log the cause, when the bucket fails for a reason that is not the owner's", async () => {
         const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

         vi.spyOn(UploadFiles, 'form').mockRejectedValueOnce(
            new Error('brain@project.iam.gserviceaccount.com does not have storage.objects.list access to the bucket')
         )
         vi.spyOn(UploadFiles, 'verify').mockRejectedValueOnce(new Error('bucket outage'))

         await expect(LinkedInReplyService.uploadForm(userId, UPLOAD, 'cv.pdf', 10)).rejects.toThrow(
            'Files cannot be sent right now. Try again in a moment.'
         )
         await expect(LinkedInReplyService.send(userId, conversationId, 'Hi', UPLOAD)).rejects.toThrow(
            'Files cannot be sent right now. Try again in a moment.'
         )
         expect(requested).toEqual([])
         expect(log).toHaveBeenCalledWith(expect.stringContaining('storage.objects.list'))
      })

      it('should refuse an upload with no files in it, and one with a type that cannot be sent, before anything starts', async () => {
         const verify = vi.spyOn(UploadFiles, 'verify')

         verify.mockResolvedValueOnce([])
         verify.mockResolvedValueOnce([
            {
               name: 'setup.exe',
               bytes: 5,
            },
         ])

         await expect(LinkedInReplyService.send(userId, conversationId, 'Hi', UPLOAD)).rejects.toBeInstanceOf(
            TaskRefusedError
         )
         await expect(LinkedInReplyService.send(userId, conversationId, 'Hi', UPLOAD)).rejects.toBeInstanceOf(
            TaskRefusedError
         )
         expect(requested).toEqual([])
      })

      it('should move the files of a reply that ended once, keep none deleted, leave the ones still being sent, and try again after a failure', async () => {
         const moveUpload = vi.spyOn(KeptFiles, 'moveUpload').mockResolvedValue(1)
         const row = (state: 'SENT' | 'SENDING', uploadId: string) => ({
            userId,
            accountId,
            conversationId,
            text: 'x',
            state,
            uploadId,
            sessionId: randomUUID(),
         })
         const ended = randomUUID()
         const going = randomUUID()

         await PrismaService.client.linkedInReply.createMany({ data: [row('SENT', ended), row('SENDING', going)] })

         await expect(LinkedInReplyService.keepFiles()).resolves.toBe(1)
         await expect(LinkedInReplyService.keepFiles()).resolves.toBe(0)
         expect(moveUpload).toHaveBeenCalledTimes(1)
         expect(moveUpload).toHaveBeenCalledWith(userId, accountId, ended)

         await PrismaService.client.linkedInReply.updateMany({
            where: { uploadId: ended },
            data: { filesKeptAt: null },
         })
         moveUpload.mockRejectedValueOnce(new Error('bucket down'))
         vi.spyOn(console, 'error').mockImplementation(() => undefined)

         await expect(LinkedInReplyService.keepFiles()).resolves.toBe(0)
         await expect(LinkedInReplyService.keepFiles()).resolves.toBe(1)
      })
   })
})
