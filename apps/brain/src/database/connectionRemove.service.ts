import { PrismaService } from './prisma.service'

// What the "Remove connection" block reads (.plan/account-action-blocks.md): which of the chosen accounts each person is still a
// connection of, and where each asked removal stands. The removals themselves go through `LinkedInConnectionService.remove`, which keeps
// the day's limit and the rest between two. Every call is scoped to the owner.

export type RemovalStanding = {
   status: 'WAITING' | 'DONE' | 'FAILED' | 'UNSURE'
   reason: string | null
   // What a removal that is over is called: removed, or gone from the list already.
   label?: 'REMOVED' | 'GONE'
}

export class ConnectionRemoveService {
   // For each person, the first of these accounts (in the order given) they are still on the list of.
   public static async connected(userId: string, accountIds: string[], slugs: string[]) {
      const rows = await PrismaService.client.linkedInConnection.findMany({
         where: {
            userId,
            account: { userId },
            accountId: { in: accountIds },
            slug: { in: slugs },
            status: 'CONNECTED',
         },
         select: {
            id: true,
            slug: true,
            accountId: true,
         },
      })
      const found = new Map<string, { id: string; accountId: string }>()

      for (const accountId of accountIds) {
         for (const row of rows.filter(each => each.accountId === accountId && !found.has(each.slug))) {
            found.set(row.slug, {
               id: row.id,
               accountId,
            })
         }
      }

      return found
   }

   // Where each asked removal stands, by the connection's id.
   public static async standing(userId: string, ids: string[]) {
      const rows = await PrismaService.client.linkedInConnection.findMany({
         where: {
            userId,
            id: { in: ids },
         },
         select: {
            id: true,
            status: true,
            failure: true,
         },
      })

      return new Map(
         rows.map(row => [
            row.id,
            (row.status === 'REMOVED'
               ? {
                    status: 'DONE',
                    reason: null,
                    label: 'REMOVED',
                 }
               : row.status === 'GONE'
                 ? {
                      status: 'DONE',
                      reason: 'It was not on the list any more.',
                      label: 'GONE',
                   }
                 : row.status === 'UNKNOWN'
                   ? {
                        status: 'UNSURE',
                        reason: row.failure,
                     }
                   : row.status === 'FAILED'
                     ? {
                          status: 'FAILED',
                          reason: row.failure,
                       }
                     : {
                          status: 'WAITING',
                          reason: null,
                       }) satisfies RemovalStanding,
         ])
      )
   }
}
