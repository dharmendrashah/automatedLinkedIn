import { KeptFiles, UploadFiles } from 'core'

import { kindOfName } from '@automatedLinkedIn/contracts'

import { REPLY_TASK } from './linkedInReply.hooks'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskRefusedError } from './taskErrors'

// Unverified against LinkedIn's own limits; kept in one place (.plan/unibox-send.md, Q2).
export const REPLY_LIMITS = {
   // Replies one account sends in 24 hours, and the quiet time between two.
   perDay: 40,
   gapMs: 30_000,
   // The most characters of a reply: the command that carries it may not pass 8 KB as JSON (the task limits it the same).
   maxChars: 4000,
   // The task's own limit is 10 minutes (files upload through a proxy); a reply still sending after this long was lost with its run.
   staleMs: 15 * 60 * 1000,
} as const

const DAY_MS = 24 * 60 * 60 * 1000
const STALE_SENTENCE = 'No answer came from the browser. Check the conversation on LinkedIn.'

// Prisma's code for a unique index that a second row would break.
const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002'

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

      const { accountId, linkedInId, title } = conversation

      await this.checkLimits(accountId)

      const files = uploadId ? await this.filesOf(userId, uploadId) : []

      let replyId: string | undefined

      try {
         await TaskService.request({
            userId,
            task: REPLY_TASK,
            accountId,
            trigger: 'manual',
            input: {
               thread: linkedInId,
               title,
               text: text.trim(),
               ...(uploadId && {
                  uploadId,
                  files: files.map(({ name, kind }) => ({
                     name,
                     kind,
                  })),
               }),
            },
            onStart: async (sessionId, tx) => {
               const reply = await tx.linkedInReply.create({
                  data: {
                     userId,
                     accountId,
                     conversationId,
                     text: text.trim(),
                     attachments: files,
                     ...(uploadId && { uploadId }),
                     sessionId,
                  },
                  select: { id: true },
               })

               replyId = reply.id
            },
         })
      } catch (error) {
         if (isUniqueViolation(error)) {
            throw new TaskRefusedError('A reply is already being sent from this account.')
         }

         throw error
      }

      return replyId ? { id: replyId } : null
   }

   // The files of an upload as brain kept them: what the task is told is read from the bucket, never from the caller, and a type that may
   // not be sent is refused again here.
   private static async filesOf(userId: string, uploadId: string) {
      const stored = await UploadFiles.list(userId, uploadId)

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
         },
      })
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
            state: { not: 'SENDING' },
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

   // Replies that went or may have gone count; ones that did not go do not.
   private static async checkLimits(accountId: string, now = Date.now()) {
      const recent = await PrismaService.client.linkedInReply.findMany({
         where: {
            accountId,
            state: { in: ['SENDING', 'SENT', 'UNKNOWN'] },
            createdAt: { gte: new Date(now - DAY_MS) },
         },
         select: { createdAt: true },
         orderBy: { createdAt: 'desc' },
         take: REPLY_LIMITS.perDay,
      })

      if (recent.length >= REPLY_LIMITS.perDay) {
         throw new TaskRefusedError(
            `This account has sent ${REPLY_LIMITS.perDay} replies in 24 hours. Try again later.`
         )
      }

      const [newest] = recent

      if (newest && now - newest.createdAt.getTime() < REPLY_LIMITS.gapMs) {
         const seconds = Math.ceil((REPLY_LIMITS.gapMs - (now - newest.createdAt.getTime())) / 1000)

         throw new TaskRefusedError(`Wait ${seconds} seconds before the next reply from this account.`)
      }
   }
}
