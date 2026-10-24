import { MESSAGES_TASK } from './linkedInMessages.hooks'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskRefusedError, TaskUnavailableError } from './taskErrors'

// The first read of an account takes what the task allows; later ones only need what is new at the top of the list.
const FIRST_READ = 50
const LATER_READ = 20

export type MessagesAccount = {
   messagesReadAt: Date | null
   messagesResumeSkip: number | null
   messagesResumeUntil: number | null
}

// A batch that was only partly read goes on after what was read, to where it ends (.plan/messages-resume.md).
export const messagesInput = ({ messagesReadAt, messagesResumeSkip, messagesResumeUntil }: MessagesAccount) => {
   if (messagesResumeSkip !== null && messagesResumeUntil !== null && messagesResumeUntil > messagesResumeSkip) {
      return {
         skip: messagesResumeSkip,
         limit: messagesResumeUntil - messagesResumeSkip,
      }
   }

   const limit = messagesReadAt === null ? FIRST_READ : LATER_READ

   return { limit }
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
            messagesReadAt: true,
            messagesResumeSkip: true,
            messagesResumeUntil: true,
         },
         orderBy: { createdAt: 'asc' },
      })
      const result: RefreshResult = {
         started: 0,
         skipped: [],
      }

      for (const { id, ...account } of accounts) {
         try {
            await TaskService.request({
               userId,
               task: MESSAGES_TASK,
               accountId: id,
               trigger: 'manual',
               input: messagesInput(account),
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
