import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { PostFiles } from 'core'

import { type PostBlock } from '@automatedLinkedIn/contracts'

import { PostPublicationService } from './postPublication.service'
import { PrismaService } from './prisma.service'
import { SpiderSessionService } from './spiderSession.service'
import { TaskService } from './task.service'
import { BrowseBudgetError, TaskBusyError, TaskRefusedError } from './taskErrors'
import { UserService } from './user.service'

// Needs PostgreSQL. The task itself is not started: `TaskService.request` is replaced by a stand-in that saves what the service asks to
// save in the run's transaction, as the real one does.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const FILE_ID = '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34'

let userId: string
let otherUserId: string
let accountId: string
let otherAccountId: string

const account = (id: string, status: 'ACTIVE' | 'PENDING' = 'ACTIVE') =>
   PrismaService.client.linkedInAccount.create({
      data: {
         userId: id,
         email: `${randomUUID()}@example.com`,
         secret: 'x',
         secretIv: 'x',
         secretTag: 'x',
         status,
      },
   })

const words = (text: string): PostBlock => ({
   id: randomUUID(),
   type: 'TEXT',
   text,
})

const photo = (keyed = true): PostBlock => ({
   id: randomUUID(),
   type: 'PHOTOS',
   items: [
      {
         id: FILE_ID,
         name: 'a.jpg',
         bytes: 1000,
         ...(keyed && { key: `posts/${userId}/${FILE_ID}/a.jpg` }),
      },
   ],
})

const draft = (blocks: PostBlock[], plannedAt: Date | null = null, forUser = userId, forAccount = accountId) =>
   PrismaService.client.postDraft.create({
      data: {
         userId: forUser,
         accountId: forAccount,
         blocks,
         plannedAt,
         plannedZone: plannedAt ? 'Asia/Kolkata' : null,
      },
   })

const publication = (
   data: { state: 'SCHEDULED' | 'QUEUED' | 'SENDING' | 'POSTED' | 'FAILED' | 'UNKNOWN' } & Record<string, unknown>
) =>
   PrismaService.client.postPublication.create({
      data: {
         userId,
         accountId,
         blocks: [words(`Earlier ${randomUUID()}`)],
         ...data,
      },
   })

const anId = { id: expect.any(String) }

const requested: Array<{ task: string; input: Record<string, unknown> }> = []

const startRun = (id: string) =>
   SpiderSessionService.startTask({
      id,
      userId,
      linkedInAccountId: accountId,
      task: 'linkedin-post',
      taskVersion: 1,
      trigger: 'manual',
      input: {},
      startedAt: new Date(),
   })

const stateOf = async (id: string | undefined) =>
   (await PrismaService.client.postPublication.findUniqueOrThrow({ where: { id: id ?? '' } })).state

describe('PostPublicationService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      accountId = (await account(userId)).id
      otherAccountId = (await account(otherUserId)).id
   })

   beforeEach(async () => {
      await PrismaService.client.postPublication.deleteMany({ where: { userId } })
      await PrismaService.client.postDraft.deleteMany({ where: { userId: { in: [userId, otherUserId] } } })
      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: { status: 'ACTIVE' },
      })
      requested.length = 0
      vi.restoreAllMocks()
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

   describe('publish', () => {
      it('should copy the draft whole, delete it, and start the task at once when the account is free', async () => {
         const saved = await draft([words('Shipping today.'), photo()])
         const posted = await PostPublicationService.publish(userId, saved.id)

         expect(posted).toMatchObject({ state: 'QUEUED' })
         await expect(stateOf(posted?.id)).resolves.toBe('SENDING')
         await expect(PrismaService.client.postDraft.count({ where: { id: saved.id } })).resolves.toBe(0)
         expect(requested).toEqual([
            {
               task: 'linkedin-post',
               input: {
                  text: 'Shipping today.',
                  files: [
                     {
                        id: FILE_ID,
                        name: 'a.jpg',
                        kind: 'PHOTOS',
                     },
                  ],
                  audience: 'ANYONE',
                  comments: 'ANYONE',
               },
            },
         ])
      })

      it("should answer null for a draft that is not the owner's", async () => {
         const foreign = await draft([words('Mine')], null, otherUserId, otherAccountId)

         await expect(PostPublicationService.publish(userId, foreign.id)).resolves.toBeNull()
         await expect(PostPublicationService.publish(userId, randomUUID())).resolves.toBeNull()
         await expect(PrismaService.client.postDraft.count({ where: { id: foreign.id } })).resolves.toBe(1)
      })

      it('should refuse with a sentence, and keep the draft, for an empty post, a file still uploading, or an account not signed in', async () => {
         const empty = await draft([words('')])
         const uploading = await draft([words('Hi'), photo(false)])
         const unsigned = await draft([words('Hello there')])

         await expect(PostPublicationService.publish(userId, empty.id)).rejects.toThrow(/words or a file/)
         await expect(PostPublicationService.publish(userId, uploading.id)).rejects.toThrow(/uploading/)

         await PrismaService.client.linkedInAccount.update({
            where: { id: accountId },
            data: { status: 'PENDING' },
         })

         await expect(PostPublicationService.publish(userId, unsigned.id)).rejects.toThrow(/signed in/)
         await expect(PrismaService.client.postDraft.count({ where: { userId } })).resolves.toBe(3)
         await expect(PrismaService.client.postPublication.count({ where: { userId } })).resolves.toBe(0)
      })

      it('should refuse the same words from the account within 7 days, and accept them once it did not go', async () => {
         const first = await draft([words('Same words')])
         const second = await draft([words('Same words')])
         const sent = await PostPublicationService.publish(userId, first.id)

         await expect(PostPublicationService.publish(userId, second.id)).rejects.toThrow(/last 7 days/)

         await PrismaService.client.postPublication.update({
            where: { id: sent?.id ?? '' },
            data: {
               state: 'FAILED',
               startedAt: new Date(Date.now() - 3 * HOUR),
               createdAt: new Date(Date.now() - 3 * HOUR),
            },
         })

         await expect(PostPublicationService.publish(userId, second.id)).resolves.toMatchObject({ state: 'QUEUED' })
      })

      it('should refuse a post less than an hour from another, and a fourth in 24 hours', async () => {
         await publication({
            state: 'POSTED',
            createdAt: new Date(Date.now() - 30 * 60 * 1000),
            startedAt: new Date(Date.now() - 30 * 60 * 1000),
         })

         const soon = await draft([words('Too soon')])

         await expect(PostPublicationService.publish(userId, soon.id)).rejects.toThrow(/an hour/)

         await PrismaService.client.postPublication.deleteMany({ where: { userId } })

         for (const hours of [2, 4, 6]) {
            await publication({
               state: 'POSTED',
               createdAt: new Date(Date.now() - hours * HOUR),
               startedAt: new Date(Date.now() - hours * HOUR),
            })
         }

         await expect(PostPublicationService.publish(userId, soon.id)).rejects.toThrow(/3 posts in 24 hours/)
      })

      it('should leave a post queued, started later, when the account is busy', async () => {
         await publication({
            state: 'SENDING',
            startedAt: new Date(),
            createdAt: new Date(Date.now() - 3 * DAY),
         })

         const saved = await draft([words('Waiting')])
         const posted = await PostPublicationService.publish(userId, saved.id)

         await expect(stateOf(posted?.id)).resolves.toBe('QUEUED')
         expect(requested).toEqual([])
      })
   })

   describe('schedule', () => {
      it('should plan the draft for its time without starting anything, and delete the draft', async () => {
         const at = new Date(Date.now() + 3 * HOUR)
         const saved = await draft([words('Later')], at)
         const planned = await PostPublicationService.schedule(userId, saved.id)

         expect(planned).toMatchObject({ state: 'SCHEDULED' })
         await expect(
            PrismaService.client.postPublication.findUniqueOrThrow({ where: { id: planned?.id ?? '' } })
         ).resolves.toMatchObject({
            scheduledAt: at,
            plannedZone: 'Asia/Kolkata',
         })
         await expect(PrismaService.client.postDraft.count({ where: { id: saved.id } })).resolves.toBe(0)
         expect(requested).toEqual([])
      })

      it('should refuse a draft with no time, one that is not ahead, and one that breaks the limits at its time', async () => {
         const none = await draft([words('No time')])
         const past = await draft([words('Past')], new Date(Date.now() + 10 * 1000))
         const at = new Date(Date.now() + 5 * HOUR)

         await publication({
            state: 'SCHEDULED',
            scheduledAt: new Date(at.getTime() + 20 * 60 * 1000),
         })

         const close = await draft([words('Close')], at)

         await expect(PostPublicationService.schedule(userId, none.id)).rejects.toThrow(/Choose a time/)
         await expect(PostPublicationService.schedule(userId, past.id)).rejects.toThrow(/a minute ahead/)
         await expect(PostPublicationService.schedule(userId, close.id)).rejects.toThrow(/an hour/)
         await expect(PostPublicationService.schedule(userId, randomUUID())).resolves.toBeNull()
      })
   })

   describe('dispatchDue', () => {
      it('should queue a planned post once it is due and start it', async () => {
         const due = await publication({
            state: 'SCHEDULED',
            scheduledAt: new Date(Date.now() - 60 * 1000),
         })
         const later = await publication({
            state: 'SCHEDULED',
            scheduledAt: new Date(Date.now() + 3 * HOUR),
         })

         await expect(PostPublicationService.dispatchDue()).resolves.toEqual({
            started: 1,
            due: 1,
            expired: 0,
         })
         await expect(stateOf(due.id)).resolves.toBe('SENDING')
         await expect(stateOf(later.id)).resolves.toBe('SCHEDULED')
      })

      it('should end a post that is an hour past its time without having started, with nothing posted', async () => {
         const missed = await publication({
            state: 'SCHEDULED',
            scheduledAt: new Date(Date.now() - 2 * HOUR),
         })

         await expect(PostPublicationService.dispatchDue()).resolves.toMatchObject({
            expired: 1,
            started: 0,
         })
         await expect(
            PrismaService.client.postPublication.findUniqueOrThrow({ where: { id: missed.id } })
         ).resolves.toMatchObject({
            state: 'FAILED',
            failure: expect.stringContaining('Nothing was posted'),
         })
      })

      it('should keep a post queued when the task is busy or the account has no browsing time, and fail it when the task refuses', async () => {
         const first = await publication({
            state: 'QUEUED',
            createdAt: new Date(),
         })

         vi.mocked(TaskService.request).mockRejectedValueOnce(new TaskBusyError('busy'))
         await expect(PostPublicationService.dispatchDue()).resolves.toMatchObject({ started: 0 })
         await expect(stateOf(first.id)).resolves.toBe('QUEUED')

         vi.mocked(TaskService.request).mockRejectedValueOnce(
            new BrowseBudgetError('Outside office hours.', 'OUTSIDE_OFFICE', new Date(), 'tomorrow at 09:00')
         )
         await PostPublicationService.dispatchDue()
         await expect(stateOf(first.id)).resolves.toBe('QUEUED')

         vi.mocked(TaskService.request).mockRejectedValueOnce(new TaskRefusedError('This task needs a proxy.'))
         await PostPublicationService.dispatchDue()
         await expect(
            PrismaService.client.postPublication.findUniqueOrThrow({ where: { id: first.id } })
         ).resolves.toMatchObject({
            state: 'FAILED',
            failure: 'This task needs a proxy.',
         })
      })

      it('should start one post at a time per account, and the next an hour after the last started', async () => {
         const one = await publication({
            state: 'QUEUED',
            createdAt: new Date(Date.now() - 40 * 60 * 1000),
         })
         const two = await publication({
            state: 'QUEUED',
            createdAt: new Date(Date.now() - 30 * 60 * 1000),
         })

         await PostPublicationService.dispatchDue()
         await expect(stateOf(one.id)).resolves.toBe('SENDING')
         await expect(stateOf(two.id)).resolves.toBe('QUEUED')

         await PrismaService.client.postPublication.update({
            where: { id: one.id },
            data: {
               state: 'POSTED',
               startedAt: new Date(Date.now() - 2 * HOUR),
            },
         })
         await PostPublicationService.dispatchDue()
         await expect(stateOf(two.id)).resolves.toBe('SENDING')
      })
   })

   describe('backToDraft', () => {
      it('should make the draft again, with its time while it is ahead, and remove the post', async () => {
         const at = new Date(Date.now() + 3 * HOUR)
         const planned = await publication({
            state: 'SCHEDULED',
            scheduledAt: at,
            plannedZone: 'Asia/Kolkata',
         })
         const back = await PostPublicationService.backToDraft(userId, planned.id)

         await expect(PrismaService.client.postPublication.count({ where: { id: planned.id } })).resolves.toBe(0)
         await expect(
            PrismaService.client.postDraft.findUniqueOrThrow({ where: { id: back?.id ?? '' } })
         ).resolves.toMatchObject({
            plannedAt: at,
            plannedZone: 'Asia/Kolkata',
            accountId,
         })
      })

      it("should take back a failed or unsure post, and refuse one that is sending, posted or not the owner's", async () => {
         const failed = await publication({ state: 'FAILED' })
         const unsure = await publication({ state: 'UNKNOWN' })
         const sending = await publication({
            state: 'SENDING',
            startedAt: new Date(),
         })
         const posted = await publication({ state: 'POSTED' })

         await expect(PostPublicationService.backToDraft(userId, failed.id)).resolves.toMatchObject(anId)
         await expect(PostPublicationService.backToDraft(userId, unsure.id)).resolves.toMatchObject(anId)
         await expect(PostPublicationService.backToDraft(userId, sending.id)).resolves.toBeNull()
         await expect(PostPublicationService.backToDraft(userId, posted.id)).resolves.toBeNull()
         await expect(PostPublicationService.backToDraft(otherUserId, sending.id)).resolves.toBeNull()
      })
   })

   describe('endStale and deleteFiles', () => {
      it('should end a post that is sending long after its run could have ended as unsure, never failed', async () => {
         const lost = await publication({
            state: 'SENDING',
            startedAt: new Date(Date.now() - HOUR),
         })

         await expect(PostPublicationService.endStale()).resolves.toBe(1)
         await expect(stateOf(lost.id)).resolves.toBe('UNKNOWN')
      })

      it('should delete the files of a post that went, once, and leave those of a failed one', async () => {
         const remove = vi.spyOn(PostFiles, 'remove').mockResolvedValue(0)
         const key = `posts/${userId}/${FILE_ID}/a.jpg`
         const went = await publication({
            state: 'POSTED',
            blocks: [photo()],
         })

         await publication({
            state: 'FAILED',
            blocks: [photo()],
         })

         await expect(PostPublicationService.deleteFiles()).resolves.toBe(1)
         expect(remove).toHaveBeenCalledWith([key])
         await expect(
            PrismaService.client.postPublication.findUniqueOrThrow({ where: { id: went.id } })
         ).resolves.toMatchObject({ filesDeletedAt: expect.any(Date) })
         await expect(PostPublicationService.deleteFiles()).resolves.toBe(0)
      })

      it('should try again later when the files could not be deleted', async () => {
         vi.spyOn(PostFiles, 'remove').mockResolvedValue(1)
         vi.spyOn(console, 'error').mockImplementation(() => undefined)

         const went = await publication({
            state: 'POSTED',
            blocks: [photo()],
         })

         await expect(PostPublicationService.deleteFiles()).resolves.toBe(0)
         await expect(
            PrismaService.client.postPublication.findUniqueOrThrow({ where: { id: went.id } })
         ).resolves.toMatchObject({ filesDeletedAt: null })
      })
   })

   describe('list and get', () => {
      it('should serve a post only to its owner, with the words in short and no blocks', async () => {
         const mine = await publication({
            state: 'POSTED',
            blocks: [words('Hello world')],
            link: 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/',
         })

         await expect(PostPublicationService.get(userId, mine.id)).resolves.toMatchObject({
            id: mine.id,
            state: 'POSTED',
            words: 'Hello world',
            link: 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/',
         })
         await expect(PostPublicationService.get(otherUserId, mine.id)).resolves.toBeNull()
         await expect(PostPublicationService.list(otherUserId)).resolves.toEqual([])
         await expect(PostPublicationService.list(userId)).resolves.toHaveLength(1)
      })
   })

   describe('publishFromBlock', () => {
      const link = {
         runId: 'run-1',
         nodeId: 'write',
      }

      it('should queue the post with its run and block, and start it at once when the account is free', async () => {
         const made = await PostPublicationService.publishFromBlock(userId, accountId, [words('From a workflow')], link)

         expect(requested).toHaveLength(1)
         await expect(stateOf(made.id)).resolves.toBe('SENDING')
         await expect(PostPublicationService.ofStep(link.runId, link.nodeId)).resolves.toEqual([
            expect.objectContaining({
               id: made.id,
               state: 'SENDING',
            }),
         ])
         await expect(PostPublicationService.get(userId, made.id)).resolves.toMatchObject({ fromWorkflow: true })
      })

      it('should refuse with a sentence when the account is not signed in, the post is empty or the words are a repeat', async () => {
         await PostPublicationService.publishFromBlock(userId, accountId, [words('Same words')], link)

         await expect(
            PostPublicationService.publishFromBlock(userId, accountId, [words('Same words')], link)
         ).rejects.toThrow('already has a post with these words')
         await expect(PostPublicationService.publishFromBlock(userId, accountId, [], link)).rejects.toBeInstanceOf(
            TaskRefusedError
         )

         const pending = await account(userId, 'PENDING')

         await expect(
            PostPublicationService.publishFromBlock(userId, pending.id, [words('Other words')], link)
         ).rejects.toThrow('signed in')
      })

      it('should refuse a file that is not the owner’s', async () => {
         const foreign: PostBlock = {
            id: randomUUID(),
            type: 'DOCUMENT',
            file: {
               id: FILE_ID,
               name: 'a.pdf',
               bytes: 1000,
               key: `posts/${otherUserId}/${FILE_ID}/a.pdf`,
            },
         }

         await expect(PostPublicationService.publishFromBlock(userId, accountId, [foreign], link)).rejects.toThrow(
            'not yours'
         )
         expect(requested).toHaveLength(0)
      })

      it('should read the last post of each account, and leave a workflow post out of Back to draft and the file sweep', async () => {
         const remove = vi.spyOn(PostFiles, 'remove').mockResolvedValue(0)
         const went = await publication({
            state: 'POSTED',
            blocks: [photo()],
            ...link,
         })
         const failed = await publication({
            state: 'FAILED',
            blocks: [photo()],
            ...link,
         })

         const last = await PostPublicationService.lastPosts([accountId, otherAccountId])

         expect([...last.keys()]).toEqual([accountId])
         await expect(PostPublicationService.deleteFiles()).resolves.toBe(0)
         await expect(PostPublicationService.backToDraft(userId, failed.id)).resolves.toBeNull()
         await expect(PostPublicationService.removeFilesOfAccount(userId, accountId)).resolves.toBeUndefined()
         expect(remove).not.toHaveBeenCalled()
         await expect(stateOf(went.id)).resolves.toBe('POSTED')
      })
   })
})
