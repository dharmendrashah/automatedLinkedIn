import { CONNECTIONS_TASK } from './linkedInConnection.hooks'
import { LinkedInConnectionService } from './linkedInConnection.service'
import { profileUrlOf } from './personContacts'
import { PrismaService } from './prisma.service'

// What the "Get my connections" block asks and reads (.plan/account-action-blocks.md). The read itself is the account's
// `linkedin-connections` task; its file is stored by the worker, and the block gives what was stored.

export type ReadState = 'RUNNING' | 'DONE' | 'FAILED'

export class ConnectionReadService {
   // Asks the account's read; an account that is already being read counts as asked. Throws the refusal when it cannot be asked.
   public static async ask(userId: string, accountId: string) {
      const asked = await LinkedInConnectionService.refresh(userId, accountId)

      return asked !== null
   }

   // Where the read stands: running until its run ended and its file is stored, done once it is, failed when it ended without one.
   // A read that ended before `since` is an older one: the one asked for has not begun.
   public static async state(accountId: string, since: Date): Promise<ReadState> {
      const session = await PrismaService.client.spiderSession.findFirst({
         where: {
            linkedInAccountId: accountId,
            task: CONNECTIONS_TASK,
            kind: 'TASK',
         },
         orderBy: { startedAt: 'desc' },
         select: {
            status: true,
            startedAt: true,
            finishedAt: true,
            connectionImport: { select: { status: true } },
         },
      })

      if (!session || session.status === 'IN_PROGRESS') {
         return 'RUNNING'
      }

      if ((session.finishedAt ?? session.startedAt) < since) {
         return 'RUNNING'
      }

      if (session.status === 'FAILED' || !session.connectionImport) {
         return 'FAILED'
      }

      return session.connectionImport.status === 'PENDING'
         ? 'RUNNING'
         : session.connectionImport.status === 'DONE'
           ? 'DONE'
           : 'FAILED'
   }

   // The people the accounts are connected to, the most recent first, each once.
   public static async people(userId: string, accountIds: string[], take: number) {
      const rows = await PrismaService.client.linkedInConnection.findMany({
         where: {
            userId,
            accountId: { in: accountIds },
            status: 'CONNECTED',
         },
         orderBy: [{ position: 'asc' }, { id: 'asc' }],
         distinct: ['slug'],
         take,
         select: {
            slug: true,
            name: true,
            headline: true,
            connectedOn: true,
         },
      })

      return rows.map(row => ({
         slug: row.slug,
         url: profileUrlOf(row.slug),
         name: row.name,
         headline: row.headline,
         connectedOn: row.connectedOn?.toISOString().slice(0, 10) ?? null,
      }))
   }
}
