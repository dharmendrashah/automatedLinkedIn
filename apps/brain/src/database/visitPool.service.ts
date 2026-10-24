import { REPEAT_DAYS } from './pageVisit.service'
import { PrismaService } from './prisma.service'

const DAY_MS = 24 * 60 * 60 * 1000

// What a workflow's "Choose LinkedIn accounts" block reads to take turns (.plan/select-accounts-block.md). Every call is
// scoped to the owner's own accounts.
export class VisitPoolService {
   // The chosen accounts that are the owner's, with their status, in the order they were listed.
   public static async accounts(userId: string, ids: string[]) {
      const rows = await PrismaService.client.linkedInAccount.findMany({
         where: {
            userId,
            id: { in: ids },
         },
         select: {
            id: true,
            status: true,
         },
      })
      const byId = new Map(rows.map(row => [row.id, row]))

      return ids.flatMap(id => byId.get(id) ?? [])
   }

   // When each account last asked for a visit, whatever came of it.
   public static async lastVisits(accountIds: string[]) {
      const rows = await PrismaService.client.linkedInPageVisit.groupBy({
         by: ['accountId'],
         where: { accountId: { in: accountIds } },
         _max: { createdAt: true },
      })

      return new Map(
         rows.flatMap(({ accountId, _max }) => (_max.createdAt ? [[accountId, _max.createdAt] as const] : []))
      )
   }

   // The pages of a kind that any of these accounts viewed (or has been asked to view) within the repeat window.
   public static async viewedBy(accountIds: string[], kind: 'PROFILE' | 'COMPANY', slugs: string[]) {
      const rows = await PrismaService.client.linkedInPageVisit.findMany({
         where: {
            accountId: { in: accountIds },
            kind,
            slug: { in: slugs },
            status: { in: ['ASKED', 'DONE'] },
            createdAt: { gte: new Date(Date.now() - REPEAT_DAYS * DAY_MS) },
         },
         select: { slug: true },
      })

      return new Set(rows.map(({ slug }) => slug))
   }

   // The visits a block of a run asked for so far.
   public static ofStep(runId: string, nodeId: string) {
      return PrismaService.client.linkedInPageVisit.findMany({
         where: {
            runId,
            nodeId,
         },
         select: {
            slug: true,
            accountId: true,
            status: true,
            createdAt: true,
         },
      })
   }
}
