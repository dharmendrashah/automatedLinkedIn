import { KeptFiles, UploadFiles, UploadRefused } from 'core'

import { kindOfName, safeFileName } from '@automatedLinkedIn/contracts'

import { REPLY_TASK } from './linkedInReply.hooks'
import { budgetWait } from './postPublication.rules'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { BrowseBudgetError, TaskBusyError, TaskRefusedError, TaskUnavailableError } from './taskErrors'

// Unverified against LinkedIn's own limits; kept in one place (.plan/unibox-send.md, Q2).
export const REPLY_LIMITS = {
   // Replies one account sends in 24 hours, and the quiet time between the starts of two.
   perDay: 40,
   gapMs: 30_000,
   // The most replies that may wait their turn on one account (.plan/reply-queue.md).
   queued: 5,
   // The most characters of a reply: the command that carries it may not pass 8 KB as JSON (the task limits it the same).
   maxChars: 4000,
   // The task's own limit is 10 minutes (files upload through a proxy); a reply still sending after this long was lost with its run.
   staleMs: 15 * 60 * 1000,
   // A queued reply that has not started this long after its time (when it was asked, or when its wait said it could) ends as failed.
   queuedMs: 15 * 60 * 1000,
} as const

const DAY_MS = 24 * 60 * 60 * 1000
const STALE_SENTENCE = 'No answer came from the browser. Check the conversation on LinkedIn.'
const NOT_STARTED_SENTENCE = 'It could not start in time. Nothing was sent.'

// Another process took the reply first: it stays as that process left it.
class ReplyTaken extends Error {}

// Prisma's code for a unique index that a second row would break.
const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002'

// A refusal of the upload store is a sentence for the owner, the same as any other refusal to send. Any other failure of the bucket
// (a missing permission, an outage) is logged here and never shown: its text names the bucket and the service account.
const refusal = async <T>(work: () => Promise<T>): Promise<T> => {
   try {
      return await work()
   } catch (error) {
      if (error instanceof UploadRefused) {
         throw new TaskRefusedError(error.message)
      }

      console.error(`Uploads: ${(error as Error).message}`)

      throw new TaskRefusedError('Files cannot be sent right now. Try again in a moment.')
   }
}

// The owner's replies from the Unibox, each typed into the account's own LinkedIn page by the `linkedin-reply` task. Every call is
// scoped to the owner. A reply is created once, with its run, and is never started again by brain.
export class LinkedInReplyService {
   // Starts the reply and resolves to its id; null when the conversation is not the owner's. Throws TaskRefusedError with a
   // sentence when it cannot be sent now (the limits, an account that is busy or not signed in).
   public static async send(userId: string, conversationId: string, text: string, uploadId?: string) {
      const conversation = await PrismaService.client.linkedInConversation.findFirst({
         where: {
            id: conversationId,
            userId,
         },
         select: {
            accountId: true,
            linkedInId: true,
            title: true,
         },
      })

      if (!conversation) {
         return null
      }

      const { accountId } = conversation

      const account = await PrismaService.client.linkedInAccount.findUnique({
         where: { id: accountId },
         select: { status: true },
      })

      if (account?.status !== 'ACTIVE') {
         throw new TaskRefusedError('Replying needs an account that is signed in. Run Test login first.')
      }

      await this.checkLimits(accountId)

      const files = uploadId ? await this.filesOf(userId, uploadId) : []
      const reply = await PrismaService.client.linkedInReply.create({
         data: {
            userId,
            accountId,
            conversationId,
            text: text.trim(),
            attachments: files,
            state: 'QUEUED',
            ...(uploadId && { uploadId }),
         },
         select: { id: true },
      })

      // When the account is free this starts it now; otherwise the reply-send job does when its turn comes. A failure here is the
      // job's to retry, never the owner's to see: the reply is saved.
      await this.dispatchNext(accountId).catch((error: unknown) => {
         console.error(`Could not start the queued replies of account ${accountId}: ${(error as Error).message}`)
      })

      return { id: reply.id }
   }

   // Starts the oldest queued reply of the account when nothing blocks it: no reply is sending, and the last one started more than
   // the quiet time ago. Resolves to whether a reply was started. A reply whose run cannot be asked for yet (the task is still running
   // or not announced, or the account has no browsing time now) stays queued and says when it can start; one that can never start ends
   // as failed with the sentence of the refusal.
   public static async dispatchNext(accountId: string, now = Date.now()) {
      const db = PrismaService.client
      const busy = await db.linkedInReply.findFirst({
         where: {
            accountId,
            OR: [{ state: 'SENDING' }, { startedAt: { gte: new Date(now - REPLY_LIMITS.gapMs) } }],
         },
         select: { id: true },
      })

      if (busy) {
         return false
      }

      const next = await db.linkedInReply.findFirst({
         where: {
            accountId,
            state: 'QUEUED',
         },
         orderBy: { createdAt: 'asc' },
         select: {
            id: true,
            userId: true,
            text: true,
            attachments: true,
            uploadId: true,
            waitReason: true,
            waitUntil: true,
            waitZone: true,
            conversation: {
               select: {
                  linkedInId: true,
                  title: true,
               },
            },
         },
      })

      if (!next) {
         return false
      }

      // Told it must wait, and not yet time: not asked again, and the replies behind it say the same.
      if (next.waitUntil && next.waitUntil.getTime() > now) {
         await this.noteWait(accountId, {
            reason: next.waitReason,
            until: next.waitUntil,
            zone: next.waitZone,
         })

         return false
      }

      const files = this.namedFiles(next.attachments)

      try {
         await TaskService.request({
            userId: next.userId,
            task: REPLY_TASK,
            accountId,
            trigger: 'manual',
            input: {
               thread: next.conversation.linkedInId,
               title: next.conversation.title,
               text: next.text,
               ...(next.uploadId && {
                  uploadId: next.uploadId,
                  files,
               }),
            },
            onStart: async (sessionId, tx) => {
               const { count } = await tx.linkedInReply.updateMany({
                  where: {
                     id: next.id,
                     state: 'QUEUED',
                  },
                  data: {
                     state: 'SENDING',
                     sessionId,
                     startedAt: new Date(),
                     waitReason: null,
                     waitUntil: null,
                     waitZone: null,
                  },
               })

               if (count === 0) {
                  throw new ReplyTaken()
               }
            },
         })

         return true
      } catch (error) {
         // The account has no browsing time now (resting between two sessions, outside its working hours): the reply keeps its place and
         // says when it can start. The owner never has to send it again.
         if (error instanceof BrowseBudgetError) {
            await this.noteWait(accountId, {
               reason: budgetWait(error.reason),
               until: error.until,
               zone: error.zone ?? null,
            })

            return false
         }

         // Someone else took it, or the account is busy: it keeps its place.
         if (
            error instanceof ReplyTaken ||
            isUniqueViolation(error) ||
            error instanceof TaskBusyError ||
            error instanceof TaskUnavailableError
         ) {
            return false
         }

         if (error instanceof TaskRefusedError) {
            await db.linkedInReply.updateMany({
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

   // What the reply-send job does: gives every account with a queued reply its turn, and ends the replies that waited too long.
   public static async dispatchWaiting(now = Date.now()) {
      const db = PrismaService.client
      const late = new Date(now - REPLY_LIMITS.queuedMs)
      const expired = await db.linkedInReply.updateMany({
         where: {
            state: 'QUEUED',
            OR: [
               {
                  waitUntil: null,
                  createdAt: { lt: late },
               },
               { waitUntil: { lt: late } },
            ],
         },
         data: {
            state: 'FAILED',
            failure: NOT_STARTED_SENTENCE,
         },
      })
      const waiting = await db.linkedInReply.findMany({
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
         expired: expired.count,
      }
   }

   // Saves why the queued replies of an account have not started and the earliest they may, for the page. Only the ones that do not say it
   // already are written, since the job asks every few seconds.
   private static async noteWait(accountId: string, wait: { reason: string | null; until: Date; zone: string | null }) {
      await PrismaService.client.linkedInReply.updateMany({
         where: {
            accountId,
            state: 'QUEUED',
            OR: [{ waitUntil: null }, { waitUntil: { not: wait.until } }],
         },
         data: {
            waitReason: wait.reason,
            waitUntil: wait.until,
            waitZone: wait.zone,
         },
      })
   }

   // The name and kind of each file of a reply, as the task is told them.
   private static namedFiles(stored: unknown) {
      return Array.isArray(stored)
         ? (stored as unknown[]).flatMap(item => {
              const { name, kind } = (item ?? {}) as { name?: unknown; kind?: unknown }

              return typeof name === 'string' && typeof kind === 'string'
                 ? [
                      {
                         name,
                         kind,
                      },
                   ]
                 : []
           })
         : []
   }

   // A signed form for the page to post one file of a reply straight to the bucket (.plan/unibox-presigned-uploads.md): only a type
   // LinkedIn takes, within the limits, for one object of this owner. Throws TaskRefusedError with a sentence when it cannot be done.
   public static async uploadForm(userId: string, uploadId: string, name: string, bytes: number) {
      const safe = safeFileName(name)
      const kind = kindOfName(safe)

      if (!kind) {
         throw new TaskRefusedError('This type of file cannot be sent.')
      }

      const form = await refusal(() => UploadFiles.form(userId, uploadId, safe, bytes))

      return {
         ...form,
         kind,
      }
   }

   // The files of an upload as brain checked them: what the task is told is read from the bucket, never from the caller, each file is
   // looked at again (size and first bytes), and a type that may not be sent is refused again here.
   private static async filesOf(userId: string, uploadId: string) {
      const stored = await refusal(() => UploadFiles.verify(userId, uploadId))

      if (stored.length === 0) {
         throw new TaskRefusedError('The files were not found. Attach them again.')
      }

      return stored.map(({ name, bytes }) => {
         const kind = kindOfName(name)

         if (!kind) {
            throw new TaskRefusedError('A file is of a type that cannot be sent.')
         }

         return {
            name,
            kind,
            bytes,
         }
      })
   }

   // What the page polls: the state of one reply of the owner.
   public static async get(userId: string, id: string) {
      return PrismaService.client.linkedInReply.findFirst({
         where: {
            id,
            userId,
         },
         select: {
            id: true,
            conversationId: true,
            state: true,
            failure: true,
            sentAt: true,
            waitReason: true,
            waitUntil: true,
            waitZone: true,
         },
      })
   }

   // The owner dismisses a reply that did not go (or may not have), so the page stops showing it after a reload. A reply that is being
   // sent or went cannot be dismissed. False for one that is not the owner's or cannot be.
   public static async dismiss(userId: string, id: string) {
      const { count } = await PrismaService.client.linkedInReply.updateMany({
         where: {
            id,
            userId,
            state: { in: ['FAILED', 'UNKNOWN'] },
         },
         data: { dismissedAt: new Date() },
      })

      return count > 0
   }

   // A reply still sending long after its task could have ended was lost with its run. It may have gone, so it is unsure, never
   // failed. Resolves to how many were ended.
   public static async endStale(now = new Date()) {
      const { count } = await PrismaService.client.linkedInReply.updateMany({
         where: {
            state: 'SENDING',
            createdAt: { lt: new Date(now.getTime() - REPLY_LIMITS.staleMs) },
         },
         data: {
            state: 'UNKNOWN',
            failure: STALE_SENTENCE,
         },
      })

      return count
   }

   // Moves the files of replies that have ended (sent, failed or unsure) to their permanent place; they are never deleted
   // (.plan/unibox-keep-messages-and-files.md). A reply whose files could not be moved is tried again on the next pass. Resolves to
   // how many replies were handled.
   public static async keepFiles() {
      const done = await PrismaService.client.linkedInReply.findMany({
         where: {
            uploadId: { not: null },
            filesKeptAt: null,
            state: { notIn: ['SENDING', 'QUEUED'] },
         },
         select: {
            id: true,
            userId: true,
            accountId: true,
            uploadId: true,
         },
         take: 20,
      })
      let kept = 0

      for (const { id, userId, accountId, uploadId } of done) {
         try {
            await KeptFiles.moveUpload(userId, accountId, uploadId ?? '')
            await PrismaService.client.linkedInReply.update({
               where: { id },
               data: { filesKeptAt: new Date() },
            })
            kept += 1
         } catch (error) {
            console.error(`Could not keep the files of reply ${id}: ${(error as Error).name}`)
         }
      }

      return kept
   }

   // Replies that went or may have gone count, and the ones waiting their turn; ones that did not go do not. The quiet time between two
   // replies is not a refusal: the queue keeps it (`dispatchNext`).
   private static async checkLimits(accountId: string, now = Date.now()) {
      const recent = await PrismaService.client.linkedInReply.count({
         where: {
            accountId,
            state: { in: ['QUEUED', 'SENDING', 'SENT', 'UNKNOWN'] },
            createdAt: { gte: new Date(now - DAY_MS) },
         },
      })

      if (recent >= REPLY_LIMITS.perDay) {
         throw new TaskRefusedError(
            `This account has sent ${REPLY_LIMITS.perDay} replies in 24 hours. Try again later.`
         )
      }

      const waiting = await PrismaService.client.linkedInReply.count({
         where: {
            accountId,
            state: 'QUEUED',
         },
      })

      if (waiting >= REPLY_LIMITS.queued) {
         throw new TaskRefusedError(
            `${REPLY_LIMITS.queued} replies are already waiting to be sent from this account. Wait for them to go.`
         )
      }
   }
}
