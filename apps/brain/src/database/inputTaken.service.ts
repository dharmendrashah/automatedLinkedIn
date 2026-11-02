import { PrismaService } from './prisma.service'

// What an input block of a workflow took, for "Skip what this workflow already took" (.plan/input-blocks-filters.md). A
// block takes the next batch each run; a retry of the same run takes the same batch again, so it never skips its own run.

export type TakenKind = 'POST' | 'PROFILE' | 'COMPANY'

const KEEP_DAYS = 180
const DAY_MS = 24 * 60 * 60 * 1000

export class InputTakenService {
   // The slugs earlier runs of the workflow took.
   public static async slugs(workflowId: string, kind: TakenKind, exceptRunId: string | null) {
      const rows = await PrismaService.client.workflowInputTaken.findMany({
         where: {
            workflowId,
            kind,
            ...(exceptRunId ? { runId: { not: exceptRunId } } : {}),
         },
         select: { slug: true },
      })

      return rows.map(({ slug }) => slug)
   }

   // Remembers what a run took, and forgets what was taken long ago.
   public static async record(workflowId: string, runId: string, kind: TakenKind, slugs: string[]) {
      await PrismaService.client.workflowInputTaken.deleteMany({
         where: {
            workflowId,
            createdAt: { lt: new Date(Date.now() - KEEP_DAYS * DAY_MS) },
         },
      })

      if (slugs.length > 0) {
         await PrismaService.client.workflowInputTaken.createMany({
            data: slugs.map(slug => ({
               workflowId,
               kind,
               slug,
               runId,
            })),
            skipDuplicates: true,
         })
      }
   }
}
