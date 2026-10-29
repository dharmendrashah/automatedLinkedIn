import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { KeptFiles, UploadFiles, UploadRefused } from 'core'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { linkedInReplyHooks } from './linkedInReply.hooks'
import { LinkedInReplyService, REPLY_LIMITS } from './linkedInReply.service'
import { PrismaService } from './prisma.service'
import { SpiderSessionService } from './spiderSession.service'
import { TaskService } from './task.service'
import { BrowseBudgetError, TaskBusyError, TaskRefusedError, TaskUnavailableError } from './taskErrors'
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
         // Replying needs an account that is signed in.
         status: 'ACTIVE',
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

   return reply.sessionId ?? ''
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

   it('should queue a second reply while one is being sent from the account, and still never allow two sending, by the database too', async () => {
      await LinkedInReplyService.send(userId, conversationId, 'One')

      const second = await LinkedInReplyService.send(userId, conversationId, 'Two')

      await expect(LinkedInReplyService.get(userId, second?.id ?? '')).resolves.toMatchObject({ state: 'QUEUED' })
      expect(requested).toHaveLength(1)
      // Past the service's own check, the unique index still stops a second one sending.
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

   it('should hold the next reply for the quiet time after the one before, then start it', async () => {
      const first = await LinkedInReplyService.send(userId, conversationId, 'One')

      await finish(await sessionOf(first?.id), 'SENT')

      const second = await LinkedInReplyService.send(userId, conversationId, 'Two')

      await expect(LinkedInReplyService.get(userId, second?.id ?? '')).resolves.toMatchObject({ state: 'QUEUED' })
      await expect(LinkedInReplyService.dispatchWaiting()).resolves.toEqual({
         started: 0,
         expired: 0,
      })

      await PrismaService.client.linkedInReply.updateMany({
         where: { userId },
         data: { startedAt: new Date(Date.now() - REPLY_LIMITS.gapMs - 1000) },
      })

      await expect(LinkedInReplyService.dispatchWaiting()).resolves.toEqual({
         started: 1,
         expired: 0,
      })
      await expect(LinkedInReplyService.get(userId, second?.id ?? '')).resolves.toMatchObject({ state: 'SENDING' })
      expect(requested).toHaveLength(2)
      expect(requested[1]?.input).toMatchObject({ text: 'Two' })
   })

   describe('the queue', () => {
      const startedFor = (id: string | undefined) =>
         PrismaService.client.linkedInReply.findUniqueOrThrow({ where: { id: id ?? '' } })

      it('should send the replies of an account one at a time, first asked first sent', async () => {
         const first = await LinkedInReplyService.send(userId, conversationId, 'One')
         const second = await LinkedInReplyService.send(userId, conversationId, 'Two')
         const third = await LinkedInReplyService.send(userId, conversationId, 'Three')

         expect(requested.map(({ input }) => input.text)).toEqual(['One'])

         await finish(await sessionOf(first?.id), 'SENT')
         await PrismaService.client.linkedInReply.updateMany({
            where: { userId },
            data: { startedAt: new Date(Date.now() - REPLY_LIMITS.gapMs - 1000) },
         })
         await LinkedInReplyService.dispatchWaiting()

         expect(requested.map(({ input }) => input.text)).toEqual(['One', 'Two'])
         expect((await startedFor(second?.id)).state).toBe('SENDING')
         expect((await startedFor(third?.id)).state).toBe('QUEUED')

         // Nothing more while the second is sending.
         await expect(LinkedInReplyService.dispatchWaiting()).resolves.toMatchObject({ started: 0 })
      })

      it('should not make the replies of another account wait', async () => {
         const other = await account(userId)
         const otherConversation = await conversation(userId, other.id, '2-other')

         await LinkedInReplyService.send(userId, conversationId, 'One')

         const parallel = await LinkedInReplyService.send(userId, otherConversation.id, 'Elsewhere')

         expect((await startedFor(parallel?.id)).state).toBe('SENDING')
         expect(requested).toHaveLength(2)
      })

      it('should refuse a reply when too many are already waiting on the account', async () => {
         await LinkedInReplyService.send(userId, conversationId, 'Going')

         for (let index = 0; index < REPLY_LIMITS.queued; index += 1) {
            await LinkedInReplyService.send(userId, conversationId, `Waiting ${index}`)
         }

         await expect(LinkedInReplyService.send(userId, conversationId, 'One too many')).rejects.toThrow(
            /already waiting/
         )
      })

      it('should refuse at once when the account is not signed in, and save nothing', async () => {
         await PrismaService.client.linkedInAccount.update({
            where: { id: accountId },
            data: { status: 'NEEDS_REAUTH' },
         })

         try {
            await expect(LinkedInReplyService.send(userId, conversationId, 'Hi')).rejects.toThrow(/signed in/)
            await expect(PrismaService.client.linkedInReply.count({ where: { userId } })).resolves.toBe(0)
         } finally {
            await PrismaService.client.linkedInAccount.update({
               where: { id: accountId },
               data: { status: 'ACTIVE' },
            })
         }
      })

      it('should keep a reply queued while the task is still running or not announced, and fail one the task refuses for good', async () => {
         const request = vi.mocked(TaskService.request)

         request.mockRejectedValueOnce(new TaskBusyError('A linkedin reply is already running.'))

         const busy = await LinkedInReplyService.send(userId, conversationId, 'Busy')

         expect((await startedFor(busy?.id)).state).toBe('QUEUED')

         request.mockRejectedValueOnce(new TaskUnavailableError())
         await LinkedInReplyService.dispatchWaiting()

         expect((await startedFor(busy?.id)).state).toBe('QUEUED')

         request.mockRejectedValueOnce(new TaskRefusedError('Test the proxy first: this task needs a working proxy.'))
         await LinkedInReplyService.dispatchWaiting()

         await expect(startedFor(busy?.id)).resolves.toMatchObject({
            state: 'FAILED',
            failure: 'Test the proxy first: this task needs a working proxy.',
            sessionId: null,
         })
      })

      describe('when the account has no browsing time now', () => {
         const until = () => new Date(Date.now() + 25 * 60_000)
         const resting = (when: Date) => new BrowseBudgetError('Resting.', 'GAP', when, 'at 17:53', 'Europe/Berlin')

         it('should keep the reply queued and say why and from when, never failing it', async () => {
            const when = until()

            vi.mocked(TaskService.request).mockRejectedValueOnce(resting(when))

            const waiting = await LinkedInReplyService.send(userId, conversationId, 'Hello')

            await expect(startedFor(waiting?.id)).resolves.toMatchObject({
               state: 'QUEUED',
               failure: null,
               waitReason: "Waiting for the account's next slot.",
               waitUntil: when,
               waitZone: 'Europe/Berlin',
            })
            await expect(LinkedInReplyService.get(userId, waiting?.id ?? '')).resolves.toMatchObject({
               state: 'QUEUED',
               waitUntil: when,
            })
         })

         it('should not ask again before the time it gave, then start the reply and clear the wait', async () => {
            const when = until()

            vi.mocked(TaskService.request).mockRejectedValueOnce(resting(when))

            const waiting = await LinkedInReplyService.send(userId, conversationId, 'Hello')
            const asked = vi.mocked(TaskService.request).mock.calls.length

            await LinkedInReplyService.dispatchWaiting()

            expect(vi.mocked(TaskService.request).mock.calls).toHaveLength(asked)

            await LinkedInReplyService.dispatchWaiting(when.getTime() + 1000)

            await expect(startedFor(waiting?.id)).resolves.toMatchObject({
               state: 'SENDING',
               waitReason: null,
               waitUntil: null,
               waitZone: null,
            })
         })

         it('should keep a second reply behind the first, and end one only a quarter of an hour after its time, not after it was asked', async () => {
            const when = until()

            vi.mocked(TaskService.request).mockRejectedValueOnce(resting(when))

            const first = await LinkedInReplyService.send(userId, conversationId, 'One')
            const second = await LinkedInReplyService.send(userId, conversationId, 'Two')

            await PrismaService.client.linkedInReply.updateMany({
               where: { userId },
               data: { createdAt: new Date(Date.now() - 3 * 60 * 60_000) },
            })

            await expect(LinkedInReplyService.dispatchWaiting()).resolves.toMatchObject({
               started: 0,
               expired: 0,
            })
            expect((await startedFor(second?.id)).state).toBe('QUEUED')

            await expect(
               LinkedInReplyService.dispatchWaiting(when.getTime() + REPLY_LIMITS.queuedMs + 1000)
            ).resolves.toMatchObject({ expired: 2 })
            expect((await startedFor(first?.id)).state).toBe('FAILED')
         })
      })

      it('should end a reply that waited too long as failed, with nothing sent', async () => {
         await LinkedInReplyService.send(userId, conversationId, 'Going')

         const waiting = await LinkedInReplyService.send(userId, conversationId, 'Waiting')

         await PrismaService.client.linkedInReply.update({
            where: { id: waiting?.id ?? '' },
            data: { createdAt: new Date(Date.now() - REPLY_LIMITS.queuedMs - 1000) },
         })

         await expect(LinkedInReplyService.dispatchWaiting()).resolves.toMatchObject({ expired: 1 })
         await expect(startedFor(waiting?.id)).resolves.toMatchObject({
            state: 'FAILED',
            failure: 'It could not start in time. Nothing was sent.',
         })
      })

      it('should not let two processes start the same reply', async () => {
         const first = await LinkedInReplyService.send(userId, conversationId, 'One')

         await finish(await sessionOf(first?.id), 'SENT')
         await LinkedInReplyService.send(userId, conversationId, 'Two')
         await PrismaService.client.linkedInReply.updateMany({
            where: { userId },
            data: { startedAt: new Date(Date.now() - REPLY_LIMITS.gapMs - 1000) },
         })

         const results = await Promise.all([
            LinkedInReplyService.dispatchNext(accountId),
            LinkedInReplyService.dispatchNext(accountId),
         ])

         expect(results.filter(Boolean)).toHaveLength(1)
         // The stand-in for the task is not transactional, so what counts is the reply: one run, one sending.
         await expect(
            PrismaService.client.linkedInReply.count({
               where: {
                  userId,
                  state: 'SENDING',
               },
            })
         ).resolves.toBe(1)
      })
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

      it('should keep a reply with a photo and audio queued, with the wait, when the account has no browsing time, and leave its files where they are', async () => {
         vi.spyOn(UploadFiles, 'verify').mockResolvedValue([
            {
               name: 'photo.png',
               bytes: 5,
            },
            {
               name: 'note.m4a',
               bytes: 7,
            },
         ])

         const when = new Date(Date.now() + 25 * 60_000)

         vi.mocked(TaskService.request).mockRejectedValueOnce(
            new BrowseBudgetError('Resting.', 'GAP', when, 'at 17:53', 'Europe/Berlin')
         )

         const sent = await LinkedInReplyService.send(userId, conversationId, '', UPLOAD)

         await expect(
            PrismaService.client.linkedInReply.findUniqueOrThrow({ where: { id: sent?.id ?? '' } })
         ).resolves.toMatchObject({
            state: 'QUEUED',
            failure: null,
            uploadId: UPLOAD,
            waitUntil: when,
            attachments: [
               {
                  name: 'photo.png',
                  kind: 'IMAGE',
                  bytes: 5,
               },
               {
                  name: 'note.m4a',
                  kind: 'AUDIO',
                  bytes: 7,
               },
            ],
         })
         await expect(LinkedInReplyService.keepFiles()).resolves.toBe(0)
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
         const row = (state: 'SENT' | 'SENDING' | 'QUEUED', uploadId: string) => ({
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
         const waiting = randomUUID()

         const data = [row('SENT', ended), row('SENDING', going), row('QUEUED', waiting)]

         await PrismaService.client.linkedInReply.createMany({ data })

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

   describe('a first message to a connection', () => {
      const connect = (slug: string, over: Record<string, unknown> = {}) =>
         PrismaService.client.linkedInConnection.create({
            data: {
               userId,
               accountId,
               slug,
               name: `${slug} Name`,
               headline: '',
               ...over,
            },
         })

      beforeEach(async () => {
         await PrismaService.client.linkedInConnection.deleteMany({ where: { userId } })
         await PrismaService.client.suppression.deleteMany({ where: { userId } })
         await PrismaService.client.linkedInConversation.deleteMany({
            where: {
               accountId,
               linkedInId: { not: '2-ada' },
            },
         })
      })

      it('should queue the first message with the person, and start the message task with what it needs', async () => {
         await connect('grace')

         const started = await LinkedInReplyService.start(userId, accountId, 'grace', '  Hello Grace  ')

         expect(started).toEqual({ id: expect.any(String) })
         expect(requested).toEqual([
            {
               task: 'linkedin-message',
               input: {
                  slug: 'grace',
                  name: 'grace Name',
                  text: 'Hello Grace',
               },
            },
         ])
         await expect(
            PrismaService.client.linkedInReply.findUniqueOrThrow({ where: { id: started?.id ?? '' } })
         ).resolves.toMatchObject({
            state: 'SENDING',
            conversationId: null,
            recipientSlug: 'grace',
            recipientName: 'grace Name',
         })
      })

      it('should go on in the conversation the account already has with the person, as a reply', async () => {
         await connect('ada')
         await PrismaService.client.linkedInConversation.update({
            where: { id: conversationId },
            data: {
               participants: [
                  {
                     name: 'Ada',
                     profileUrl: 'https://www.linkedin.com/in/ada/',
                  },
               ],
            },
         })

         await LinkedInReplyService.start(userId, accountId, 'ada', 'Hi again')

         expect(requested.map(({ task }) => task)).toEqual(['linkedin-reply'])
         expect(requested[0]?.input).toMatchObject({
            thread: '2-ada',
            text: 'Hi again',
         })

         await PrismaService.client.linkedInConversation.update({
            where: { id: conversationId },
            data: { participants: [] },
         })
      })

      it('should answer like a missing person for one who is not a connection, is gone, or is of another owner', async () => {
         await connect('gone', { status: 'REMOVED' })

         await expect(LinkedInReplyService.start(userId, accountId, 'nobody', 'Hi')).resolves.toBeNull()
         await expect(LinkedInReplyService.start(userId, accountId, 'gone', 'Hi')).resolves.toBeNull()
         await expect(LinkedInReplyService.start(otherUserId, accountId, 'gone', 'Hi')).resolves.toBeNull()
         expect(requested).toEqual([])
      })

      it('should refuse a person on the do-not-contact list, and a second first message while one is on its way', async () => {
         await connect('dana')
         await connect('grace')
         await PrismaService.client.suppression.create({
            data: {
               userId,
               slug: 'dana',
            },
         })

         await expect(LinkedInReplyService.start(userId, accountId, 'dana', 'Hi')).rejects.toThrow(/do-not-contact/)

         await LinkedInReplyService.start(userId, accountId, 'grace', 'One')

         await expect(LinkedInReplyService.start(userId, accountId, 'grace', 'Two')).rejects.toThrow(/on its way/)
         expect(requested).toHaveLength(1)
      })

      it('should stop at the first messages of the day', async () => {
         await connect('grace')
         await PrismaService.client.linkedInReply.createMany({
            data: Array.from({ length: REPLY_LIMITS.firstPerDay }, (_, index) => ({
               userId,
               accountId,
               text: 'Hi',
               state: 'SENT' as const,
               recipientSlug: `someone-${index}`,
               recipientName: 'Someone',
               sessionId: randomUUID(),
            })),
         })

         await expect(LinkedInReplyService.start(userId, accountId, 'grace', 'Hi')).rejects.toThrow(/first messages/)
      })

      it('should link the first message to the conversation its run stored, and the person to it for New message', async () => {
         await connect('grace')

         const started = await LinkedInReplyService.start(userId, accountId, 'grace', 'Hello')
         const sessionId = await sessionOf(started?.id)
         const stored = await conversation(userId, accountId, '2-grace')

         await finish(sessionId, 'SENT')
         await LinkedInReplyService.linkStored(sessionId, accountId, ['2-grace'])

         await expect(
            PrismaService.client.linkedInReply.findUniqueOrThrow({ where: { id: started?.id ?? '' } })
         ).resolves.toMatchObject({
            state: 'SENT',
            conversationId: stored.id,
         })
         expect((await LinkedInReplyService.get(userId, started?.id ?? ''))?.conversationId).toBe(stored.id)
      })

      it('should link nothing when the run stored no conversation or several', async () => {
         await connect('grace')

         const started = await LinkedInReplyService.start(userId, accountId, 'grace', 'Hello')
         const sessionId = await sessionOf(started?.id)

         await conversation(userId, accountId, '2-one')
         await conversation(userId, accountId, '2-two')
         await LinkedInReplyService.linkStored(sessionId, accountId, [])
         await LinkedInReplyService.linkStored(sessionId, accountId, ['2-one', '2-two'])

         await expect(
            PrismaService.client.linkedInReply.findUniqueOrThrow({ where: { id: started?.id ?? '' } })
         ).resolves.toMatchObject({ conversationId: null })
      })
   })
})
