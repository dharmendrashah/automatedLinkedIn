import { type TaskCatalogEntry, taskCatalogEntrySchema } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'

const asEntry = (row: { manifest: unknown }) => {
   const parsed = taskCatalogEntrySchema.safeParse(row.manifest)

   return parsed.success ? [parsed.data] : []
}

// The latest version of every task the worker announced.
export const readCatalog = async (): Promise<TaskCatalogEntry[]> => {
   const rows = await PrismaService.client.taskDefinition.findMany({
      distinct: ['task'],
      orderBy: [{ task: 'asc' }, { version: 'desc' }],
   })

   return rows.flatMap(asEntry)
}
