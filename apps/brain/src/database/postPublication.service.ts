import { PostFiles } from 'core'

import { type PostPublication, type PostPublicationState } from 'generated/prisma/client'

import {
   POST_DRAFTS_MAX,
   type PostBlock,
   joinedText,
   mediaBlock,
   postBlocksSchema,
   postFilesOf,
} from '@automatedLinkedIn/contracts'

import { POST_TASK } from './linkedInPost.hooks'
import { keysOf, ownsKeys } from './postFileKeys'
import { POST_LIMITS, contentProblem, limitProblem, taskInputOf } from './postPublication.rules'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { BrowseBudgetError, TaskBusyError, TaskRefusedError, TaskUnavailableError } from './taskErrors'

const NOT_STARTED_SENTENCE = 'It could not start in time. Nothing was posted.'
const STALE_SENTENCE = 'No answer came from the browser. Check your posts on LinkedIn before posting it again.'
const UNREADABLE_SENTENCE = 'This post can no longer be read. Nothing was posted.'
// The posts that count towards the limits of an account: the ones that went, may have gone, or are on their way.
const COUNTED: PostPublicationState[] = ['SCHEDULED', 'QUEUED', 'SENDING', 'POSTED', 'UNKNOWN']
// What the page may do again with a post that has not gone for sure.
const RETURNABLE: PostPublicationState[] = ['SCHEDULED', 'QUEUED', 'FAILED', 'UNKNOWN']
const DAY_MS = 24 * 60 * 60 * 1000
const WORDS_SHOWN = 200

// Another process took the post first: it stays as that process left it.
class PostTaken extends Error {}

// Prisma's code for a unique index that a second row would break.
const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002'

const timeOf = (row: Pick<PostPublication, 'scheduledAt' | 'createdAt'>) => (row.scheduledAt ?? row.createdAt).getTime()

const blocksOf = (row: Pick<PostPublication, 'blocks'>) => {
   const parsed = postBlocksSchema.safeParse(row.blocks)

   return parsed.success ? parsed.data : undefined
}

// What the page shows of a post: where it is, what it says in short, and the link once it went. The owner's own words, served only
// to the owner.
const readPublication = (row: PostPublication) => {
   const blocks = blocksOf(row) ?? []
   const media = mediaBlock(blocks)

   return {
      id: row.id,
      accountId: row.accountId,
      state: row.state,
      words: Array.from(joinedText(blocks)).slice(0, WORDS_SHOWN).join(''),
      attachment: media?.type ?? null,
      files: postFilesOf(blocks).length,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      plannedZone: row.plannedZone,
      failure: row.failure,
      link: row.link,
      fromWorkflow: row.runId !== null,
      createdAt: row.createdAt.toISOString(),
      postedAt: row.postedAt?.toISOString() ?? null,
   }
}

export type PublicationView = ReturnType<typeof readPublication>

// The posts the owner sent for posting or planned (.plan/posting-send-task.md). A draft becomes a post by being copied whole (the
// draft is gone in the same moment), so what is posted never depends on what the draft is later changed to. Every call names the
// owner, so a foreign id is the same as a missing one. A post is made once, with its run, and is never started again by brain.
export class PostPublicationService {
   // Sends the owner's draft for posting now. Null when the draft is not the owner's; throws TaskRefusedError with a sentence when it
   // cannot be posted (the limits, a repeat, an account that is not signed in).
   public static async publish(userId: string, draftId: string, now = Date.now()) {
      return this.create(userId, draftId, undefined, now)
   }

   // Plans the owner's draft for the time it holds. Refused with a sentence when it holds none, or one that is not ahead.
   public static async schedule(userId: string, draftId: string, now = Date.now()) {
      const draft = await PrismaService.client.postDraft.findFirst({
         where: {
            id: draftId,
            userId,
         },
         select: { plannedAt: true },
      })

      if (!draft) {
         return null
      }

      if (!draft.plannedAt) {
         throw new TaskRefusedError('Choose a time first.')
      }

      if (draft.plannedAt.getTime() < now + POST_LIMITS.aheadMs) {
         throw new TaskRefusedError('Choose a time at least a minute ahead.')
      }

      return this.create(userId, draftId, draft.plannedAt, now)
   }

   private static async create(userId: string, draftId: string, plannedAt: Date | undefined, now: number) {
      const db = PrismaService.client
      const draft = await db.postDraft.findFirst({
         where: {
            id: draftId,
            userId,
         },
      })

      if (!draft) {
         return null
      }

      const parsed = postBlocksSchema.safeParse(draft.blocks)

      if (!parsed.success) {
         throw new TaskRefusedError('This draft cannot be read. Open it and save it again.')
      }

      const at = plannedAt?.getTime() ?? now

      await this.checkPost(userId, draft.accountId, parsed.data, at, now)

      const created = await db.$transaction(async tx => {
         const { count } = await tx.postDraft.deleteMany({
            where: {
               id: draftId,
               userId,
            },
         })

         if (count === 0) {
            return null
         }

         return tx.postPublication.create({
            data: {
               userId,
               accountId: draft.accountId,
               blocks: parsed.data,
               state: plannedAt ? 'SCHEDULED' : 'QUEUED',
               ...(plannedAt && {
                  scheduledAt: plannedAt,
                  plannedZone: draft.plannedZone,
               }),
            },
            select: {
               id: true,
               state: true,
            },
         })
      })

      if (!created) {
         return null
      }

      // When the account is free a post sent now starts at once; otherwise the post-send job starts it when its turn comes. A failure
      // here is the job's to retry, never the owner's to see: the post is saved.
      if (!plannedAt) {
         await this.dispatchNext(draft.accountId, now).catch((error: unknown) => {
            console.error(`Could not start the queued posts of account ${draft.accountId}: ${(error as Error).message}`)
         })
      }

      return created
   }

   // Sends the post a "Write a post" block of a run holds, now, from one of the owner's accounts (.plan/write-a-post-block.md). The files
   // stay with the block, so they are never deleted with the post. Throws TaskRefusedError with a sentence when the account cannot post it.
   public static async publishFromBlock(
      userId: string,
      accountId: string,
      blocks: PostBlock[],
      link: { runId: string; nodeId: string },
      now = Date.now()
   ) {
      if (!ownsKeys(userId, blocks)) {
         throw new TaskRefusedError('A file of this post is not yours. Attach it again.')
      }

      await this.checkPost(userId, accountId, blocks, now, now)

      const created = await PrismaService.client.postPublication.create({
         data: {
            userId,
            accountId,
            blocks,
            state: 'QUEUED',
            runId: link.runId,
            nodeId: link.nodeId,
         },
         select: {
            id: true,
            state: true,
         },
      })

      await this.dispatchNext(accountId, now).catch((error: unknown) => {
         console.error(`Could not start the queued posts of account ${accountId}: ${(error as Error).message}`)
      })

      return created
   }

   // The posts a block of a run made so far, oldest first.
   public static ofStep(runId: string, nodeId: string) {
      return PrismaService.client.postPublication.findMany({
         where: {
            runId,
            nodeId,
         },
         orderBy: { createdAt: 'asc' },
         select: {
            id: true,
            state: true,
            failure: true,
            link: true,
         },
      })
   }

   // When each account last had a post, whatever came of it.
   public static async lastPosts(accountIds: string[]) {
      const rows = await PrismaService.client.postPublication.groupBy({
         by: ['accountId'],
         where: { accountId: { in: accountIds } },
         _max: { createdAt: true },
      })

      return new Map(
         rows.flatMap(({ accountId, _max }) => (_max.createdAt ? [[accountId, _max.createdAt] as const] : []))
      )
   }

   // Why this account cannot take this post at `at`, as a sentence; nothing when it can.
   private static async checkPost(userId: string, accountId: string, blocks: PostBlock[], at: number, now: number) {
      const problem = contentProblem(blocks)

      if (problem) {
         throw new TaskRefusedError(problem)
      }

      const account = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id: accountId,
            userId,
         },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Posting needs an account that is signed in. Run Test login first.')
      }

      await this.checkRepeat(accountId, blocks, now)
      await this.checkLimits(accountId, at)
   }

   // The limits of the account for a post at `at`. Posts that did not go do not count.
   private static async checkLimits(accountId: string, at: number) {
      const rows = await PrismaService.client.postPublication.findMany({
         where: {
            accountId,
            state: { in: COUNTED },
            OR: [
               {
                  scheduledAt: {
                     gte: new Date(at - DAY_MS),
                     lte: new Date(at + DAY_MS),
                  },
               },
               {
                  scheduledAt: null,
                  createdAt: {
                     gte: new Date(at - DAY_MS),
                     lte: new Date(at + DAY_MS),
                  },
               },
            ],
         },
         select: {
            scheduledAt: true,
            createdAt: true,
         },
      })
      const limit = limitProblem(rows.map(timeOf), at)

      if (limit) {
         throw new TaskRefusedError(limit)
      }
   }

   // The same words from the account within a week are a repeat, and refused. Posts that did not go do not count.
   private static async checkRepeat(accountId: string, blocks: PostBlock[], now: number) {
      const words = taskInputOf(blocks).text

      if (words === '') {
         return
      }

      const recent = await PrismaService.client.postPublication.findMany({
         where: {
            accountId,
            state: { in: COUNTED },
            createdAt: { gte: new Date(now - POST_LIMITS.duplicateMs) },
         },
         select: { blocks: true },
         take: 200,
      })

      if (recent.some(row => taskInputOf(blocksOf(row) ?? []).text === words)) {
         throw new TaskRefusedError('This account already has a post with these words in the last 7 days.')
      }
   }

   // The owner's posts, newest first.
   public static async list(userId: string) {
      const rows = await PrismaService.client.postPublication.findMany({
         where: { userId },
         orderBy: { createdAt: 'desc' },
         take: 100,
      })

      return rows.map(readPublication)
   }

   public static async get(userId: string, id: string) {
      const row = await PrismaService.client.postPublication.findFirst({
         where: {
            id,
            userId,
         },
      })

      return row ? readPublication(row) : null
   }

   // Takes a post that has not gone for sure back to a draft, with its time when it had one: a planned post is cancelled, a failed or
   // unsure one is edited and sent again. A post that is sending or went cannot be taken back. Resolves to the draft's id; null when it
   // is not the owner's or cannot be.
   public static async backToDraft(userId: string, id: string) {
      const db = PrismaService.client

      if ((await db.postDraft.count({ where: { userId } })) >= POST_DRAFTS_MAX) {
         throw new TaskRefusedError(`You have ${POST_DRAFTS_MAX} drafts. Delete one first.`)
      }

      return db.$transaction(async tx => {
         const row = await tx.postPublication.findFirst({
            where: {
               id,
               userId,
               runId: null,
               state: { in: RETURNABLE },
            },
         })
         const { count } = row
            ? await tx.postPublication.deleteMany({
                 where: {
                    id,
                    userId,
                    runId: null,
                    state: { in: RETURNABLE },
                 },
              })
            : { count: 0 }

         if (!row || count === 0) {
            return null
         }

         const draft = await tx.postDraft.create({
            data: {
               userId,
               accountId: row.accountId,
               blocks: row.blocks ?? [],
               ...(row.scheduledAt &&
                  row.scheduledAt.getTime() > Date.now() && {
                     plannedAt: row.scheduledAt,
                     plannedZone: row.plannedZone,
                  }),
            },
            select: { id: true },
         })

         return { id: draft.id }
      })
   }

   // Starts the oldest queued post of the account when nothing blocks it: none is sending, and the last one started more than the quiet
   // time ago. Resolves to whether one was started. A post whose run cannot be asked for yet (the task is running, not announced, or the
   // account has no browsing time now) stays queued; one that can never start ends as failed with the sentence of the refusal.
   public static async dispatchNext(accountId: string, now = Date.now()) {
      const db = PrismaService.client
      const busy = await db.postPublication.findFirst({
         where: {
            accountId,
            OR: [{ state: 'SENDING' }, { startedAt: { gte: new Date(now - POST_LIMITS.gapMs) } }],
         },
         select: { id: true },
      })

      if (busy) {
         return false
      }

      const next = await db.postPublication.findFirst({
         where: {
            accountId,
            state: 'QUEUED',
         },
         orderBy: { createdAt: 'asc' },
      })

      if (!next) {
         return false
      }

      const blocks = blocksOf(next)

      if (!blocks) {
         await db.postPublication.updateMany({
            where: {
               id: next.id,
               state: 'QUEUED',
            },
            data: {
               state: 'FAILED',
               failure: UNREADABLE_SENTENCE,
            },
         })

         return false
      }

      try {
         await TaskService.request({
            userId: next.userId,
            task: POST_TASK,
            accountId,
            trigger: 'manual',
            input: {
               ...taskInputOf(blocks),
               audience: 'ANYONE',
               comments: 'ANYONE',
            },
            onStart: async (sessionId, tx) => {
               const { count } = await tx.postPublication.updateMany({
                  where: {
                     id: next.id,
                     state: 'QUEUED',
                  },
                  data: {
                     state: 'SENDING',
                     sessionId,
                     startedAt: new Date(),
                  },
               })

               if (count === 0) {
                  throw new PostTaken()
               }
            },
         })

         return true
      } catch (error) {
         // Someone else took it, the account is busy, or it has no browsing time now: it keeps its place.
         if (
            error instanceof PostTaken ||
            isUniqueViolation(error) ||
            error instanceof TaskBusyError ||
            error instanceof TaskUnavailableError ||
            error instanceof BrowseBudgetError
         ) {
            return false
         }

         if (error instanceof TaskRefusedError) {
            await db.postPublication.updateMany({
               where: {
                  id: next.id,
                  state: 'QUEUED',
               },
               data: {
                  state: 'FAILED',
                  failure: error.message,
               },
            })

            return false
         }

         throw error
      }
   }

   // What the post-send job does: queues the planned posts that are due, gives every account with a queued post its turn, and ends the
   // posts that are an hour past their time without having started.
   public static async dispatchDue(now = Date.now()) {
      const db = PrismaService.client
      const late = new Date(now - POST_LIMITS.lateMs)
      const expired = await db.postPublication.updateMany({
         where: {
            state: { in: ['SCHEDULED', 'QUEUED'] },
            OR: [
               { scheduledAt: { lt: late } },
               {
                  scheduledAt: null,
                  createdAt: { lt: late },
               },
            ],
         },
         data: {
            state: 'FAILED',
            failure: NOT_STARTED_SENTENCE,
         },
      })
      const due = await db.postPublication.updateMany({
         where: {
            state: 'SCHEDULED',
            scheduledAt: { lte: new Date(now) },
         },
         data: { state: 'QUEUED' },
      })
      const waiting = await db.postPublication.findMany({
         where: { state: 'QUEUED' },
         distinct: ['accountId'],
         select: { accountId: true },
         take: 100,
      })
      let started = 0

      for (const { accountId } of waiting) {
         if (await this.dispatchNext(accountId, now)) {
            started += 1
         }
      }

      return {
         started,
         due: due.count,
         expired: expired.count,
      }
   }

   // A post still sending long after its task could have ended was lost with its run. It may have gone, so it is unsure, never failed.
   // Resolves to how many were ended.
   public static async endStale(now = Date.now()) {
      const { count } = await PrismaService.client.postPublication.updateMany({
         where: {
            state: 'SENDING',
            startedAt: { lt: new Date(now - POST_LIMITS.staleMs) },
         },
         data: {
            state: 'UNKNOWN',
            failure: STALE_SENTENCE,
         },
      })

      return count
   }

   // Deletes the files of posts that went: LinkedIn holds them now (.plan/posting-send-task.md, Q3). The files of a failed or unsure post
   // stay for a new try. A post whose files could not be deleted is tried again on the next pass. Resolves to how many were handled.
   public static async deleteFiles() {
      const done = await PrismaService.client.postPublication.findMany({
         where: {
            state: 'POSTED',
            filesDeletedAt: null,
            runId: null,
         },
         select: {
            id: true,
            blocks: true,
         },
         take: 20,
      })
      let handled = 0

      for (const { id, blocks } of done) {
         const keys = keysOf(blocksOf({ blocks }) ?? [])

         if (keys.length > 0 && (await PostFiles.remove(keys).catch(() => keys.length)) > 0) {
            console.error(`Post files: the files of post ${id} could not be deleted`)

            continue
         }

         await PrismaService.client.postPublication.update({
            where: { id },
            data: { filesDeletedAt: new Date() },
         })
         handled += 1
      }

      return handled
   }

   // Removing a LinkedIn account removes its posts with it; their files go first, so that a failure leaves the account to try again.
   public static async removeFilesOfAccount(userId: string, accountId: string) {
      const rows = await PrismaService.client.postPublication.findMany({
         where: {
            userId,
            accountId,
            filesDeletedAt: null,
            runId: null,
         },
         select: { blocks: true },
      })
      const keys = rows.flatMap(({ blocks }) => keysOf(blocksOf({ blocks }) ?? []))

      if (keys.length > 0 && (await PostFiles.remove(keys)) > 0) {
         throw new Error('The files of the posts could not be deleted.')
      }
   }
}
