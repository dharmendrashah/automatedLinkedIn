import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { TaskQueue } from 'core'

import { type Prisma } from 'generated/prisma/client'

import {
   TASK_CONTRACT_VERSION,
   type TaskCatalog,
   type TaskCatalogEntry,
   type TaskResult,
   type TaskTrigger,
   taskCatalogEntrySchema,
} from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { ProxyServerOwnershipError, ProxyServerService } from './proxyServer.service'
import { SpiderSessionService } from './spiderSession.service'
import {
   TaskNeedsProxyError,
   TaskOwnershipError,
   TaskRefusedError,
   TaskSkippedError,
   TaskUnavailableError,
} from './taskErrors'
import { TASK_HOOKS } from './taskHooks'

const MINUTE_MS = 60 * 1000

// A run that has not been answered after this long is not running any more, so it cannot block the next one.
const STALE_AFTER_MS = 30 * MINUTE_MS

const NOT_QUEUED_MESSAGE = 'The task could not be queued. Try again in a moment.'

const inputSchema = z.record(z.string(), z.unknown())

type RequestOptions = {
   userId: string
   task: string
   proxyId?: string
   accountId?: string
   // Task specific and never read here: the spider validates it.
   input?: Record<string, unknown>
   trigger: TaskTrigger
   retryOfId?: string
   // For an automatic request: the task ran inside this many milliseconds already, so there is nothing to do.
   everyMs?: number
   // The owner changed the connection since the last run, which makes `everyMs` not apply.
   changed?: boolean
}

type Scope = 'proxy' | 'account' | 'none'

const asEntry = (row: { manifest: unknown }) => {
   const parsed = taskCatalogEntrySchema.safeParse(row.manifest)

   return parsed.success ? [parsed.data] : []
}

// Brain's side of every task of the standard contract (.plan/spider-task-framework.md): it asks, applies the answer and keeps
// the catalog. It never reads a task's input, verdict or report; those are the task's own.
export class TaskService {
   // The latest version of every task the worker announced.
   public static async catalog(): Promise<TaskCatalogEntry[]> {
      const rows = await PrismaService.client.taskDefinition.findMany({
         distinct: ['task'],
         orderBy: [{ task: 'asc' }, { version: 'desc' }],
      })

      return rows.flatMap(asEntry)
   }

   // What the worker announced replaces what brain knew about those tasks. A task that is no longer announced stays known.
   public static async applyCatalog(catalog: TaskCatalog) {
      for (const manifest of catalog.tasks) {
         await PrismaService.client.taskDefinition.upsert({
            where: {
               task_version: {
                  task: manifest.task,
                  version: manifest.version,
               },
            },
            create: {
               task: manifest.task,
               version: manifest.version,
               manifest: manifest as unknown as Prisma.InputJsonObject,
            },
            update: {
               manifest: manifest as unknown as Prisma.InputJsonObject,
               seenAt: new Date(),
            },
         })
      }
   }

   // Throws ProxyServerOwnershipError or TaskOwnershipError for what is not the user's, and TaskRefusedError with a sentence
   // when the task cannot run now. Resolves to the session that will show the result.
   public static async request(options: RequestOptions) {
      const { userId, task, trigger } = options
      const definition = (await this.catalog()).find(entry => entry.task === task)

      if (!definition) {
         throw new TaskUnavailableError()
      }

      const input = inputSchema.parse(options.input ?? {})
      const proxy = options.proxyId
         ? await PrismaService.client.proxyServer.findFirst({
              where: {
                 id: options.proxyId,
                 linkedInAccount: { userId },
              },
              select: {
                 id: true,
                 linkedInAccountId: true,
              },
           })
         : null

      if (options.proxyId && !proxy) {
         throw new ProxyServerOwnershipError()
      }

      if (proxy && options.accountId && proxy.linkedInAccountId !== options.accountId) {
         throw new TaskRefusedError('That proxy belongs to another LinkedIn account.')
      }

      const accountId = options.accountId ?? proxy?.linkedInAccountId

      if (!accountId) {
         throw new TaskRefusedError('This task needs a proxy or a LinkedIn account.')
      }

      const account = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id: accountId,
            userId,
         },
         select: {
            id: true,
            email: true,
            secret: true,
            secretIv: true,
            secretTag: true,
            keyVersion: true,
         },
      })

      if (!account) {
         throw new TaskOwnershipError()
      }

      const { needs } = definition
      const picked = needs.proxy === 'none' ? null : await ProxyServerService.pickForAccount(accountId, proxy?.id)

      if (needs.proxy === 'required' && !picked) {
         throw new TaskNeedsProxyError()
      }

      await this.checkPolicy(definition, {
         userId,
         accountId,
         proxyId: picked?.summary.id,
         trigger,
         everyMs: options.everyMs,
         changed: options.changed,
      })

      const id = randomUUID()
      const requestedAt = new Date()

      await TASK_HOOKS[task]?.onRequest?.({
         id,
         userId,
         accountId,
         ...(picked && { proxyId: picked.summary.id }),
         task,
         trigger,
      })

      await SpiderSessionService.startTask({
         id,
         userId,
         linkedInAccountId: accountId,
         ...(picked && { proxy: picked.summary }),
         task,
         taskVersion: definition.version,
         trigger,
         input,
         startedAt: requestedAt,
         ...(options.retryOfId && { retryOfId: options.retryOfId }),
      })

      try {
         await TaskQueue.publish({
            contract: TASK_CONTRACT_VERSION,
            task_id: id,
            user_id: userId,
            task,
            task_version: definition.version,
            requested_at: requestedAt.toISOString(),
            trigger,
            // Forwarded as stored: the worker masks it in every recording and log.
            ...(picked && { proxy: picked.config }),
            ...(needs.account && {
               account_id: accountId,
               account_email: account.email,
               credentials: {
                  ciphertext: account.secret,
                  iv: account.secretIv,
                  tag: account.secretTag,
                  key_version: account.keyVersion,
               },
            }),
            input,
         })
      } catch (error) {
         console.error(`Could not queue the task ${task}: ${(error as Error).message}`)

         try {
            await SpiderSessionService.fail(id, NOT_QUEUED_MESSAGE, 'NOT_QUEUED')
         } catch {
            // The session stays in progress and shows as having no answer.
         }

         throw new TaskRefusedError(NOT_QUEUED_MESSAGE)
      }

      return { id }
   }

   private static async checkPolicy(
      definition: TaskCatalogEntry,
      scope: {
         userId: string
         accountId: string
         proxyId?: string
         trigger: TaskTrigger
         everyMs?: number
         changed?: boolean
      }
   ) {
      const { policy } = definition
      const by: Record<Scope, Record<string, string | undefined>> = {
         proxy: { proxyServerId: scope.proxyId },
         account: { linkedInAccountId: scope.accountId },
         none: { userId: scope.userId },
      }

      const last = await PrismaService.client.spiderSession.findFirst({
         where: {
            task: definition.task,
            kind: 'TASK',
            ...by[policy.one_at_a_time],
         },
         orderBy: { startedAt: 'desc' },
         select: {
            status: true,
            startedAt: true,
         },
      })

      if (!last) {
         return
      }

      const age = Date.now() - last.startedAt.getTime()

      if (last.status === 'IN_PROGRESS' && age < STALE_AFTER_MS) {
         throw new TaskRefusedError(`A ${definition.title.toLowerCase()} is already running.`)
      }

      if (age < policy.cooldown_ms) {
         const minutes = Math.ceil((policy.cooldown_ms - age) / MINUTE_MS)

         throw new TaskRefusedError(`Wait ${minutes} minute(s) before running this again.`)
      }

      if (scope.everyMs && !scope.changed && age < scope.everyMs) {
         throw new TaskSkippedError('This task ran recently.')
      }
   }

   // Something happened that tasks may listen to (for example a proxy tested ok): start each of them for the owner. It never
   // throws, because the change that caused the event is already saved. Resolves to how many were started.
   public static async emit(event: string, { proxyId, changed = false }: { proxyId: string; changed?: boolean }) {
      let started = 0

      try {
         const proxy = await PrismaService.client.proxyServer.findFirst({
            where: { id: proxyId },
            select: {
               id: true,
               linkedInAccountId: true,
               linkedInAccount: { select: { userId: true } },
            },
         })

         if (!proxy) {
            return 0
         }

         for (const definition of await this.catalog()) {
            const rule = definition.policy.automatic?.find(({ on }) => on === event)

            if (!rule) {
               continue
            }

            try {
               await this.request({
                  userId: proxy.linkedInAccount.userId,
                  task: definition.task,
                  proxyId: proxy.id,
                  trigger: 'automatic',
                  everyMs: rule.every_ms,
                  changed,
               })
               started += 1
            } catch (error) {
               if (!(error instanceof TaskRefusedError)) {
                  console.error(`Could not start ${definition.task} after ${event}: ${(error as Error).message}`)
               }
            }
         }
      } catch (error) {
         console.error(`Could not handle ${event} for proxy ${proxyId}: ${(error as Error).message}`)
      }

      return started
   }

   // Applies the worker's answer once. Resolves to whether this answer was the one that ended the session.
   public static async applyResult(result: TaskResult) {
      const session = await SpiderSessionService.finishTask(result)

      if (!session) {
         return false
      }

      await TASK_HOOKS[result.task]?.onResult?.(session, result)

      return true
   }
}
