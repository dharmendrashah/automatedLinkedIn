import { type DataClient, DataServiceError } from 'core/dataClient'
import { advanceJob } from 'core/dataJob'

import { type DataRead, type DataReadKind, type Prisma } from 'generated/prisma/client'

import { ConflictError, isUniqueViolation } from './conflict'
import { DATA_READS } from './dataReads'
import { PrismaService } from './prisma.service'
import { WalletService } from './wallet.service'

// The paid reads the owner asks for in a drawer. The API only queues them; the brain worker moves each one a step per
// tick (see `advanceJob`), retries a read that failed without a charge, and keeps the result. Once a day per item
// counts only reads that finished and cost money. Messages are shown to the client and never name the data supplier.

export type ReadClient = Pick<DataClient, 'start' | 'check' | 'findJob' | 'cancel'>
type Log = { error: (message: string) => void }

// A read held this long by a worker that stopped is taken again.
const STALE_CLAIM_MS = 2 * 60 * 1000
// After an unexpected error the read is looked at again a minute later.
const ERROR_PAUSE_MS = 60_000
const DUE_BATCH = 20

type QueueInput = {
   userId: string
   kind: DataReadKind
   slug: string
   variant?: string
   operation: string
   params: Prisma.InputJsonObject
   // The client whose month the cost is booked to (My network).
   clientId?: string
}

const startOfDay = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)

const paramsOf = (value: Prisma.JsonValue): Record<string, unknown> =>
   value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}

const failedMessage = (kind: DataReadKind) =>
   `Reading ${DATA_READS[kind].noun} did not work. You were not charged for it; please try again later.`

export class DataReadService {
   // Queues a read, or returns the one already queued for the item (a double click).
   public static async queue({ userId, kind, slug, variant = '', operation, params, clientId }: QueueInput) {
      const { noun } = DATA_READS[kind]

      if (await WalletService.belowFloor()) {
         throw new ConflictError('Reads are paused for a short while. Please try again later.')
      }

      const paidToday = await PrismaService.client.dataRead.count({
         where: {
            userId,
            kind,
            slug,
            variant,
            status: 'DONE',
            costMicros: { gt: 0 },
            finishedAt: { gte: startOfDay() },
         },
      })

      if (paidToday > 0) {
         throw new ConflictError(`You already read ${noun} today.`)
      }

      const activeKey = [userId, kind, slug, variant].join(':')

      try {
         return await PrismaService.client.dataRead.create({
            data: {
               userId,
               kind,
               slug,
               variant,
               operation,
               params,
               activeKey,
               clientId,
            },
         })
      } catch (error) {
         if (!isUniqueViolation(error)) {
            throw error
         }

         return PrismaService.client.dataRead.findUniqueOrThrow({ where: { activeKey } })
      }
   }

   // The items of these that had a paid read finish since then.
   public static async paidSince(userId: string, kind: DataReadKind, slugs: string[], since: Date) {
      const reads = await PrismaService.client.dataRead.findMany({
         where: {
            userId,
            kind,
            slug: { in: slugs },
            status: 'DONE',
            costMicros: { gt: 0 },
            finishedAt: { gte: since },
         },
         select: { slug: true },
         distinct: ['slug'],
      })

      return new Set(reads.map(({ slug }) => slug))
   }

   // The newest read of an item, for the drawer: still going, done, or why it failed.
   public static latest(userId: string, kind: DataReadKind, slug: string) {
      return PrismaService.client.dataRead.findFirst({
         where: {
            userId,
            kind,
            slug,
         },
         orderBy: { createdAt: 'desc' },
         select: {
            status: true,
            message: true,
            createdAt: true,
            finishedAt: true,
         },
      })
   }

   // Reads waiting for a worker: queued, running, or due for a retry, and not held by a live worker.
   public static due(now = new Date()) {
      return PrismaService.client.dataRead.findMany({
         where: {
            status: { in: ['QUEUED', 'RUNNING'] },
            retryAt: { lte: now },
            OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } }],
         },
         orderBy: { retryAt: 'asc' },
         take: DUE_BATCH,
      })
   }

   // True when this worker now holds the read.
   public static async claim(read: DataRead) {
      const { count } = await PrismaService.client.dataRead.updateMany({
         where: {
            id: read.id,
            claimedAt: read.claimedAt,
            status: { in: ['QUEUED', 'RUNNING'] },
         },
         data: { claimedAt: new Date() },
      })

      return count === 1
   }

   // Moves one claimed read a step and gives it back. True when it ended.
   public static async advance(read: DataRead, client: ReadClient, log: Log) {
      const spec = DATA_READS[read.kind]
      const fresh = !read.jobId && !read.sentAt

      try {
         if (fresh && !(await spec.wanted(read.userId, read.slug))) {
            await DataReadService.finish(read, 'FAILED', 0, 'This is no longer in your workspace, so it was not read.')

            return true
         }

         if (fresh && (await WalletService.belowFloor())) {
            await DataReadService.finish(
               read,
               'FAILED',
               0,
               'Reads are paused for a short while. Please try again later.'
            )

            return true
         }

         const next = await advanceJob(
            client,
            {
               slug: read.operation,
               params: paramsOf(read.params),
               jobId: read.jobId,
               sentAt: read.sentAt,
               attempts: read.attempts,
            },
            {
               sending: async () => {
                  await DataReadService.update(read.id, {
                     status: 'RUNNING',
                     sentAt: new Date(),
                  })
               },
               started: async jobId => {
                  await DataReadService.update(read.id, { jobId })
               },
            }
         )

         if (next.status === 'running') {
            await DataReadService.update(read.id, { claimedAt: null })

            return false
         }

         if (next.status === 'retry') {
            log.error(`data read=${read.id} failed, retry ${read.attempts + 1}: ${next.error}`)
            await DataReadService.update(read.id, {
               attempts: { increment: 1 },
               retryAt: next.at,
               claimedAt: null,
               ...(next.restart
                  ? {
                       jobId: null,
                       sentAt: null,
                    }
                  : {}),
            })

            return false
         }

         if (next.status === 'failed') {
            log.error(`data read=${read.id} failed after its retries: ${next.error}`)
            await DataReadService.finish(read, 'FAILED', 0, failedMessage(read.kind))

            return true
         }

         const { outcome } = next
         const [first, ...rest] = outcome.status === 'completed' ? outcome.rows : []

         if (!first) {
            await DataReadService.finish(
               read,
               'FAILED',
               outcome.costMicros,
               outcome.status === 'completed' ? spec.missing : failedMessage(read.kind)
            )

            return true
         }

         // Removed while it was read: paid, but not kept.
         if (await spec.wanted(read.userId, read.slug)) {
            await spec.store(
               {
                  userId: read.userId,
                  slug: read.slug,
                  params: paramsOf(read.params),
               },
               [first, ...rest]
            )
         }

         await DataReadService.finish(read, 'DONE', outcome.costMicros, null)

         return true
      } catch (error) {
         log.error(`data read=${read.id} error: ${error instanceof Error ? error.message : 'unknown'}`)

         if (error instanceof DataServiceError) {
            await DataReadService.finish(read, 'FAILED', 0, failedMessage(read.kind))

            return true
         }

         await DataReadService.update(read.id, {
            claimedAt: null,
            retryAt: new Date(Date.now() + ERROR_PAUSE_MS),
         })

         return false
      }
   }

   private static update(id: string, data: Prisma.DataReadUpdateInput) {
      return PrismaService.client.dataRead.update({
         where: { id },
         data,
      })
   }

   // Ends a read and books what it cost to the client's month, once.
   private static finish(read: DataRead, status: 'DONE' | 'FAILED', costMicros: number, message: string | null) {
      return PrismaService.client.$transaction(async tx => {
         const { count } = await tx.dataRead.updateMany({
            where: {
               id: read.id,
               finishedAt: null,
            },
            data: {
               status,
               costMicros,
               message,
               activeKey: null,
               claimedAt: null,
               finishedAt: new Date(),
            },
         })

         if (count === 0 || costMicros === 0) {
            return
         }

         await tx.spendLedger.create({
            data: {
               userId: read.userId,
               callId: `read:${read.id}`,
               label: DATA_READS[read.kind].label,
               amountMicros: costMicros,
               month: new Date().toISOString().slice(0, 7),
               clientId: read.clientId,
            },
         })
      })
   }
}
