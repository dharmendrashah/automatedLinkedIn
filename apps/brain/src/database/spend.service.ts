import { PrismaService } from './prisma.service'

// What the data cost, from the ledger: per client and UTC month. Amounts only.

const DELETED = 'Deleted workflow'
// Spend outside a workflow: the full profiles the owner chose to read.
const PROFILE_READS = 'Profile reads'

const nameOf = (workflowId: string | null, names: Map<string, string>) =>
   workflowId ? names.get(workflowId) || DELETED : PROFILE_READS

const namesOf = async (workflowIds: string[]) => {
   const workflows = await PrismaService.client.workflow.findMany({
      where: { id: { in: workflowIds } },
      select: {
         id: true,
         name: true,
      },
   })

   return new Map(workflows.map(({ id, name }) => [id, name]))
}

export class SpendService {
   // Every month the client spent in, newest first, with the amount per workflow.
   public static async usage(userId: string) {
      const groups = await PrismaService.client.spendLedger.groupBy({
         by: ['month', 'workflowId'],
         where: { userId },
         _sum: { amountMicros: true },
         _count: { runId: true },
         orderBy: { month: 'desc' },
      })
      const names = await namesOf(groups.flatMap(({ workflowId }) => (workflowId ? [workflowId] : [])))
      const months = new Map<
         string,
         { month: string; totalMicros: number; workflows: { name: string; amountMicros: number }[] }
      >()

      for (const group of groups) {
         const amountMicros = group._sum.amountMicros ?? 0
         const month = months.get(group.month) ?? {
            month: group.month,
            totalMicros: 0,
            workflows: [],
         }

         month.totalMicros += amountMicros
         month.workflows.push({
            name: nameOf(group.workflowId, names),
            amountMicros,
         })
         months.set(group.month, month)
      }

      return [...months.values()]
   }

   // The statement lines of one month: per workflow, the runs charged and the amount.
   public static async statement(userId: string, month: string) {
      const groups = await PrismaService.client.spendLedger.groupBy({
         by: ['workflowId', 'runId'],
         where: {
            userId,
            month,
         },
         _sum: { amountMicros: true },
         _count: { _all: true },
      })
      const names = await namesOf(groups.flatMap(({ workflowId }) => (workflowId ? [workflowId] : [])))
      const lines = new Map<string, { name: string; runs: number; amountMicros: number }>()

      for (const group of groups) {
         const name = nameOf(group.workflowId, names)
         const line = lines.get(name) ?? {
            name,
            runs: 0,
            amountMicros: 0,
         }

         // A run counts once; profile reads have no run, so each read counts.
         line.runs += group.runId ? 1 : group._count._all
         line.amountMicros += group._sum.amountMicros ?? 0
         lines.set(name, line)
      }

      return [...lines.values()]
   }

   // The owner's view: what each client spent in a month.
   public static async byClient(month: string) {
      const groups = await PrismaService.client.spendLedger.groupBy({
         by: ['userId'],
         where: { month },
         _sum: { amountMicros: true },
      })
      const users = await PrismaService.client.user.findMany({
         where: { id: { in: groups.map(({ userId }) => userId) } },
         select: {
            id: true,
            email: true,
            name: true,
         },
      })
      const byId = new Map(users.map(user => [user.id, user]))

      return groups
         .map(group => ({
            email: byId.get(group.userId)?.email ?? 'Deleted account',
            name: byId.get(group.userId)?.name ?? null,
            amountMicros: group._sum.amountMicros ?? 0,
         }))
         .sort((a, b) => b.amountMicros - a.amountMicros)
   }
}
