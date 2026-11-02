import { PrismaService } from './prisma.service'

// Where one account's read stands, for the blocks of Account Actions that read (.plan/account-action-blocks.md). A read is a task
// whose finished run is stored by the worker outside the transaction that ended it, so it is done only once the file is stored.

export type ReadState = 'RUNNING' | 'DONE' | 'FAILED'

// The import row each reading task leaves on its session.
const IMPORT_OF = {
   'linkedin-connections': 'connectionImport',
   'linkedin-invitations': 'invitationImport',
   'linkedin-messages': 'messageImport',
} as const

export type ReadTask = keyof typeof IMPORT_OF

// Running until the newest run of the task ended, after `since`, and its file was stored; failed when it ended without one. A run
// that ended before `since` is an older read: the one asked for has not begun.
export const readStateOf = async (accountId: string, task: ReadTask, since: Date): Promise<ReadState> => {
   const session = await PrismaService.client.spiderSession.findFirst({
      where: {
         linkedInAccountId: accountId,
         task,
         kind: 'TASK',
      },
      orderBy: { startedAt: 'desc' },
      select: {
         status: true,
         startedAt: true,
         finishedAt: true,
         connectionImport: { select: { status: true } },
         invitationImport: { select: { status: true } },
         messageImport: { select: { status: true } },
      },
   })

   if (!session || session.status === 'IN_PROGRESS') {
      return 'RUNNING'
   }

   if ((session.finishedAt ?? session.startedAt) < since) {
      return 'RUNNING'
   }

   const stored = session[IMPORT_OF[task]]

   if (session.status === 'FAILED' || !stored) {
      return 'FAILED'
   }

   return stored.status === 'PENDING' ? 'RUNNING' : stored.status === 'DONE' ? 'DONE' : 'FAILED'
}
