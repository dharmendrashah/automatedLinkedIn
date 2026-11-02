import { createHash } from 'node:crypto'

import { type WorkflowItemData, readItem } from 'core'

import { type Prisma } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

// The items a search found, kept for a week so the same search is not paid for twice (.plan/workflow-collect-blocks.md).
// Only the workflow's own allow-listed items are kept, never the data service's rows.

const DAY_MS = 24 * 60 * 60 * 1000

export const SEARCH_REMEMBER_DAYS = 7

const stable = (value: unknown): unknown =>
   Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === 'object'
        ? Object.fromEntries(
             Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, each]) => [key, stable(each)])
          )
        : value

// The same settings in any key order give the same hash.
const hashOf = (params: Record<string, unknown>) =>
   createHash('sha256')
      .update(JSON.stringify(stable(params)))
      .digest('hex')

const whereOf = (userId: string, operation: string, params: Record<string, unknown>) => ({
   userId_operation_paramsHash: {
      userId,
      operation,
      paramsHash: hashOf(params),
   },
})

export class CollectCacheService {
   // What the same search found in the last 7 days, or null.
   public static async find(
      userId: string,
      operation: string,
      params: Record<string, unknown>,
      now = new Date()
   ): Promise<WorkflowItemData[] | null> {
      const found = await PrismaService.client.collectSearchCache.findUnique({
         where: whereOf(userId, operation, params),
         select: {
            items: true,
            createdAt: true,
         },
      })

      if (!found || found.createdAt < new Date(now.getTime() - SEARCH_REMEMBER_DAYS * DAY_MS)) {
         return null
      }

      return Array.isArray(found.items) ? found.items.flatMap(data => readItem(data) ?? []) : null
   }

   public static async put(
      userId: string,
      operation: string,
      params: Record<string, unknown>,
      items: WorkflowItemData[],
      now = new Date()
   ) {
      const data: Prisma.InputJsonValue = JSON.parse(JSON.stringify(items))

      await PrismaService.client.collectSearchCache.deleteMany({
         where: {
            userId,
            createdAt: { lt: new Date(now.getTime() - SEARCH_REMEMBER_DAYS * DAY_MS) },
         },
      })
      await PrismaService.client.collectSearchCache.upsert({
         where: whereOf(userId, operation, params),
         create: {
            userId,
            operation,
            paramsHash: hashOf(params),
            items: data,
         },
         update: {
            items: data,
            createdAt: now,
         },
      })
   }
}
