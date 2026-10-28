import { MESSAGES_TASK } from './linkedInMessages.hooks'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskRefusedError, TaskUnavailableError } from './taskErrors'

// The first read goes through the whole inbox in batches of this many places; a later one asks for this many at most, and
// stops at the first rows it knows (.plan/messages-first-sync-and-new-only.md).
const BATCH = 50
// How many known rows are handed to the spider, and how many in a row end the walk of a later read.
const KNOWN = 100
const STOP_AFTER_KNOWN = 3
// Once a day the newest conversations are read whatever their rows say, to find a change the rows did not show.
const SWEEP = 20
const SWEEP_EVERY_MS = 24 * 60 * 60 * 1000
// The version of the messages task that takes `known` and `stopAfterKnown`; an older spider refuses them.
const ROW_READ_VERSION = 3

export type MessagesAccount = {
   id: string
   messagesBackfilledAt: Date | null
   messagesResumeSkip: number | null
   messagesSweptAt: Date | null
}

const spiderReadsRows = async () =>
   ((await TaskService.catalog()).find(({ task }) => task === MESSAGES_TASK)?.version ?? 0) >= ROW_READ_VERSION

// What brain has of the account's newest conversations, by the hash of their rows.
const knownRows = async (accountId: string) => {
   const rows = await PrismaService.client.linkedInConversation.findMany({
      where: {
         accountId,
         rowHash: { not: null },
      },
      orderBy: {
         lastMessageAt: {
            sort: 'desc',
            nulls: 'last',
         },
      },
      take: KNOWN,
      select: { rowHash: true },
   })

   return rows.flatMap(({ rowHash }) => (rowHash ? [rowHash] : []))
}

// A sweep is due once a day for an account whose first read is done and that has nothing pending.
export const sweepDue = (account: MessagesAccount, now: Date) =>
   account.messagesBackfilledAt !== null &&
   account.messagesResumeSkip === null &&
   (account.messagesSweptAt === null || now.getTime() - account.messagesSweptAt.getTime() >= SWEEP_EVERY_MS)

// The first read (no `messagesBackfilledAt` yet) goes on from the place it reached, through the whole inbox, leaving the rows brain
// has alone. Later reads start at the top and stop at the first rows they know; one left unfinished goes on from where it stopped.
export const messagesInput = async (account: MessagesAccount, { sweep = false }: { sweep?: boolean } = {}) => {
   const first = account.messagesBackfilledAt === null

   if (!(await spiderReadsRows())) {
      return { limit: first ? BATCH : SWEEP }
   }

   if (sweep) {
      return {
         limit: SWEEP,
         known: await knownRows(account.id),
      }
   }

   const skip = account.messagesResumeSkip ?? 0

   return {
      ...(skip > 0 && { skip }),
      limit: BATCH,
      known: await knownRows(account.id),
      ...(!first && { stopAfterKnown: STOP_AFTER_KNOWN }),
   }
}

export type RefreshResult = {
   started: number
   // Why an account was left out: a sentence the owner can read.
   skipped: Array<{ accountId: string; reason: string }>
}

// The owner asks for a fresh read of the messages of some accounts (all of them when none is named). Each account is its own
// task, so one that cannot start (not signed in, another task running) does not stop the others.
export class MessagesRefresh {
   public static async request(userId: string, accountIds?: string[]): Promise<RefreshResult> {
      const accounts = await PrismaService.client.linkedInAccount.findMany({
         where: {
            userId,
            ...(accountIds && { id: { in: accountIds } }),
         },
         select: {
            id: true,
            messagesBackfilledAt: true,
            messagesResumeSkip: true,
            messagesSweptAt: true,
         },
         orderBy: { createdAt: 'asc' },
      })
      const result: RefreshResult = {
         started: 0,
         skipped: [],
      }

      for (const account of accounts) {
         const { id } = account

         try {
            await TaskService.request({
               userId,
               task: MESSAGES_TASK,
               accountId: id,
               trigger: 'manual',
               input: await messagesInput(account),
            })
            result.started += 1
         } catch (error) {
            if (error instanceof TaskRefusedError) {
               result.skipped.push({
                  accountId: id,
                  reason: error.message,
               })
            } else if (error instanceof TaskUnavailableError) {
               result.skipped.push({
                  accountId: id,
                  reason: 'Reading messages is not available yet. Try again in a moment.',
               })
            } else {
               console.error(`Could not request the messages of account ${id}: ${(error as Error).name}`)
               result.skipped.push({
                  accountId: id,
                  reason: 'Something went wrong. Try again in a moment.',
               })
            }
         }
      }

      return result
   }
}
