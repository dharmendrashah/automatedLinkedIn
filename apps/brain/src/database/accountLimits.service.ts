import { type LimitKind } from '@automatedLinkedIn/contracts'

import { BrowseBudgetService } from './browseBudget.service'
import { limitOf } from './limits'
import { PrismaService } from './prisma.service'

// Today's limits of accounts (.plan/lead-pipeline-p1-foundations.md): the seeded share of the platform maximum for the day of the
// account, which is the account's own zone, else the zone of its proxy's country, else UTC (as its browsing hours are).
export class AccountLimitsService {
   // Today's limit of each kind for each of the accounts, by account id. An unknown account id has no entry.
   public static async forAccounts<K extends LimitKind>(
      accountIds: string[],
      kinds: K[],
      now = new Date()
   ): Promise<Map<string, Record<K, number>>> {
      const accounts = await PrismaService.client.linkedInAccount.findMany({
         where: { id: { in: accountIds } },
         select: {
            id: true,
            officeTimeZone: true,
            officeDays: true,
            officeStartMinute: true,
            officeEndMinute: true,
            proxyServers: { select: { detectedCountryCode: true } },
         },
      })

      return new Map(
         accounts.map(account => {
            const { timeZone } = BrowseBudgetService.officeOf(account)

            return [
               account.id,
               Object.fromEntries(kinds.map(kind => [kind, limitOf(kind, account.id, now, timeZone)])) as Record<
                  K,
                  number
               >,
            ]
         })
      )
   }

   public static async forAccount<K extends LimitKind>(accountId: string, kinds: K[], now = new Date()) {
      return (await this.forAccounts([accountId], kinds, now)).get(accountId)
   }
}
