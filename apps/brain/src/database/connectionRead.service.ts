import { CONNECTIONS_TASK } from './linkedInConnection.hooks'
import { LinkedInConnectionService } from './linkedInConnection.service'
import { profileUrlOf } from './personContacts'
import { PrismaService } from './prisma.service'
import { type ReadState, readStateOf } from './readState'

// What the "Get my connections" block asks and reads (.plan/account-action-blocks.md). The read itself is the account's
// `linkedin-connections` task; its file is stored by the worker, and the block gives what was stored.

export class ConnectionReadService {
   // Asks the account's read; an account that is already being read counts as asked. Throws the refusal when it cannot be asked.
   public static async ask(userId: string, accountId: string) {
      const asked = await LinkedInConnectionService.refresh(userId, accountId)

      return asked !== null
   }

   public static state(accountId: string, since: Date): Promise<ReadState> {
      return readStateOf(accountId, CONNECTIONS_TASK, since)
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
