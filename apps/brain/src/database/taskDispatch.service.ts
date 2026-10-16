import { z } from 'zod'

import { TaskQueue } from 'core'

import { TASK_TRIGGERS, type TaskCommand, taskResultSchema } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { ProxyServerService } from './proxyServer.service'
import { SpiderSessionService } from './spiderSession.service'
import { readCatalog } from './taskCatalog'
import { buildTaskCommand } from './taskCommand'
import { applyTaskResult } from './taskResult'

// A task that was accepted is published until the broker confirms it (.plan/task-outbox.md). The API publishes once, right
// after it saved the task; the brain worker publishes what is left.
const LEASE_S = 60
const PUBLISH_LIMIT_MS = 5000
const GIVE_UP_AFTER_MS = 15 * 60 * 1000
const FIRST_ATTEMPT_GRACE_S = 15
const BACKOFF_MS = [10_000, 30_000, 120_000, 300_000]
const MAX_GIVE_UP_FAILURES = 3
const BATCH = 20

// Dates in the tables are UTC without a zone, so the database clock is compared in UTC too.
const NOW = "timezone('UTC', now())"

type Verdict = 'NOT_QUEUED' | 'NEEDS_PROXY' | 'UNKNOWN_TASK' | 'CANCELLED'

const MESSAGES: Record<Verdict, string> = {
   NOT_QUEUED: 'The task could not be started in time. Try again in a moment.',
   NEEDS_PROXY: 'The proxy of this task is gone. Add a proxy and try again.',
   UNKNOWN_TASK: 'This task is not available any more.',
   CANCELLED: 'The account was paused before this task started.',
}

const FAILURES = {
   timeout: 'The broker did not confirm in time',
   broker: 'The broker could not be reached or refused the task',
   proxy: 'The proxy is not usable right now',
} as const

type Claimed = {
   attempts: number
   giveUpFailures: number
   ageMs: number
}

type Built = { command: TaskCommand } | { refuse: Verdict } | { wait: string }

export type DispatchResult = {
   outcome: 'published' | 'retry' | 'gave-up' | 'skipped' | 'busy'
   // The broker could not be reached, so the other rows of this run would fail the same way.
   transport?: boolean
}

export type DispatchRun = {
   published: number
   retried: number
   gaveUp: number
}

const paramsSchema = z.object({
   input: z.record(z.string(), z.unknown()).default({}),
   proxy: z.string().nullable().default(null),
})

const loadAccount = (id: string) =>
   PrismaService.client.linkedInAccount.findUnique({
      where: { id },
      select: {
         email: true,
         status: true,
         secret: true,
         secretIv: true,
         secretTag: true,
         keyVersion: true,
      },
   })

class PublishTimeout extends Error {
   public constructor() {
      super(FAILURES.timeout)
   }
}

const publishWithin = (command: TaskCommand) => {
   const publishing = TaskQueue.publish(command)
   let timer: NodeJS.Timeout | undefined

   // A publish that loses the race may still fail later; that must not become an unhandled rejection.
   publishing.catch(() => undefined)

   return Promise.race([
      publishing,
      new Promise<never>((_resolve, reject) => {
         timer = setTimeout(() => reject(new PublishTimeout()), PUBLISH_LIMIT_MS)
      }),
   ]).finally(() => clearTimeout(timer))
}

export class TaskDispatchService {
   // Publishes one saved task. Never throws for a failure of the broker: the row stays and is tried again.
   public static async dispatch(sessionId: string): Promise<DispatchResult> {
      const claimed = await this.claim(sessionId)

      if (!claimed) {
         return { outcome: 'busy' }
      }

      const session = await PrismaService.client.spiderSession.findUnique({
         where: { id: sessionId },
         select: {
            id: true,
            userId: true,
            linkedInAccountId: true,
            task: true,
            taskVersion: true,
            trigger: true,
            status: true,
            startedAt: true,
            requestParams: true,
            proxyServerId: true,
         },
      })

      // Answered already, or removed: nothing is left to publish.
      if (!session || session.status !== 'IN_PROGRESS') {
         await this.remove(sessionId)

         return { outcome: 'skipped' }
      }

      if (claimed.ageMs >= GIVE_UP_AFTER_MS) {
         return this.giveUp(session, claimed, 'NOT_QUEUED')
      }

      const built = await this.build(session)

      if ('refuse' in built) {
         return this.giveUp(session, claimed, built.refuse)
      }

      if ('wait' in built) {
         return this.retry(session, claimed, built.wait)
      }

      try {
         await publishWithin(built.command)
      } catch (error) {
         return this.retry(session, claimed, error instanceof PublishTimeout ? FAILURES.timeout : FAILURES.broker, true)
      }

      await this.remove(sessionId)

      if (claimed.attempts > 0) {
         console.log(
            `worker task-dispatch published ${session.task} ${session.id} after ${claimed.attempts} failed attempt(s)`
         )
      }

      return { outcome: 'published' }
   }

   // What the worker does on every wake-up: the rows that are due, oldest first, a few at a time. A broker that cannot be
   // reached ends the run, because every other row would wait for the same connect timeout.
   public static async dispatchDue(signal?: AbortSignal): Promise<DispatchRun> {
      const run: DispatchRun = {
         published: 0,
         retried: 0,
         gaveUp: 0,
      }
      const due = await PrismaService.client.$queryRawUnsafe<Array<{ sessionId: string }>>(
         `SELECT "sessionId" FROM "TaskDispatch"
          WHERE "nextAttemptAt" <= ${NOW}
            AND ("claimedUntil" IS NULL OR "claimedUntil" < ${NOW})
            AND ("attempts" > 0 OR "createdAt" <= ${NOW} - ${FIRST_ATTEMPT_GRACE_S} * interval '1 second')
          ORDER BY "createdAt"
          LIMIT ${BATCH}`
      )

      for (const { sessionId } of due) {
         if (signal?.aborted) {
            break
         }

         try {
            const { outcome, transport } = await this.dispatch(sessionId)

            if (outcome === 'published') {
               run.published += 1
            } else if (outcome === 'gave-up') {
               run.gaveUp += 1
            } else if (outcome === 'retry') {
               run.retried += 1
            }

            if (transport) {
               break
            }
         } catch (error) {
            // One row that cannot be handled must not stop the others; it is tried again on the next wake-up.
            console.error(`worker task-dispatch could not handle ${sessionId}: ${(error as Error).name}`)
         }
      }

      return run
   }

   // How many tasks wait to be published and how long the oldest has waited, for the worker's health report.
   public static async waiting() {
      const [row] = await PrismaService.client.$queryRawUnsafe<
         Array<{ waiting: number; oldestSeconds: number | null }>
      >(
         `SELECT count(*)::int AS "waiting", (extract(epoch FROM (${NOW} - min("createdAt"))))::float8 AS "oldestSeconds"
          FROM "TaskDispatch"`
      )

      return {
         waiting: row?.waiting ?? 0,
         oldestSeconds: Math.round(row?.oldestSeconds ?? 0),
      }
   }

   // One statement takes the lease, so two publishers never work on the same row, and the database decides what is expired.
   private static async claim(sessionId: string) {
      const [claimed] = await PrismaService.client.$queryRawUnsafe<Claimed[]>(
         `UPDATE "TaskDispatch"
          SET "claimedUntil" = ${NOW} + ${LEASE_S}::float8 * interval '1 second'
          WHERE "sessionId" = $1 AND ("claimedUntil" IS NULL OR "claimedUntil" < ${NOW})
          RETURNING "attempts", "giveUpFailures",
                    (extract(epoch FROM (${NOW} - "createdAt")) * 1000)::float8 AS "ageMs"`,
         sessionId
      )

      return claimed
   }

   private static async remove(sessionId: string) {
      await PrismaService.client.taskDispatch.deleteMany({ where: { sessionId } })
   }

   // Builds the command from what is stored now, so credentials are not copied into the outbox and a changed proxy or
   // password is used. A command that can never be sent is refused with the verdict that says why.
   private static async build(session: {
      id: string
      userId: string
      linkedInAccountId: string
      task: string | null
      taskVersion: number | null
      trigger: string | null
      startedAt: Date
      requestParams: unknown
      proxyServerId: string | null
   }): Promise<Built> {
      const entry = (await readCatalog()).find(({ task }) => task === session.task)
      const params = paramsSchema.safeParse(session.requestParams)

      if (!entry || !session.task) {
         return { refuse: 'UNKNOWN_TASK' }
      }

      if (!params.success) {
         return { refuse: 'NOT_QUEUED' }
      }

      const { needs } = entry
      let account: Awaited<ReturnType<typeof loadAccount>> = null

      if (needs.account) {
         account = await loadAccount(session.linkedInAccountId)

         // The owner paused it while the task waited: automation skips a paused account.
         if (!account || account.status === 'DISABLED') {
            return { refuse: 'CANCELLED' }
         }
      }

      let proxy: TaskCommand['proxy']

      // A task that had a proxy never runs without one, so it cannot fall back to this server's own address.
      if (needs.proxy === 'required' && params.data.proxy === null) {
         return { refuse: 'NEEDS_PROXY' }
      }

      if (needs.proxy !== 'none' && params.data.proxy !== null) {
         if (!session.proxyServerId) {
            return { refuse: 'NEEDS_PROXY' }
         }

         const picked = await ProxyServerService.pickForAccount(session.linkedInAccountId, session.proxyServerId)

         // It may recover while the task waits, so this is tried again until the limit.
         if (!picked) {
            return { wait: FAILURES.proxy }
         }

         proxy = picked.config
      }

      try {
         return {
            command: buildTaskCommand({
               id: session.id,
               userId: session.userId,
               task: session.task,
               taskVersion: session.taskVersion ?? entry.version,
               requestedAt: session.startedAt,
               trigger: z.enum(TASK_TRIGGERS).catch('manual').parse(session.trigger),
               input: params.data.input,
               needs,
               ...(proxy && { proxy }),
               ...(account && {
                  account: {
                     id: session.linkedInAccountId,
                     ...account,
                  },
               }),
            }),
         }
      } catch {
         return { refuse: 'NOT_QUEUED' }
      }
   }

   private static async retry(
      session: { id: string; task: string | null },
      { attempts }: Claimed,
      reason: string,
      transport = false
   ): Promise<DispatchResult> {
      const delayMs = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)]

      await PrismaService.client.$executeRawUnsafe(
         `UPDATE "TaskDispatch"
          SET "attempts" = "attempts" + 1,
              "nextAttemptAt" = ${NOW} + $2::float8 * interval '1 millisecond',
              "claimedUntil" = NULL,
              "lastError" = $3
          WHERE "sessionId" = $1`,
         session.id,
         delayMs,
         reason
      )

      // The first failure is worth a line; the retries that follow are not.
      if (attempts === 0) {
         console.error(`worker task-dispatch could not publish ${session.task} ${session.id}: ${reason}`)
      }

      return {
         outcome: 'retry',
         transport,
      }
   }

   // Ends the session as a result would, so the task's hook runs and the account does not stay waiting. If that keeps
   // failing the session is ended without its hook: a session never stays in progress because of a bug in a hook.
   private static async giveUp(
      session: { id: string; task: string | null; taskVersion: number | null; startedAt: Date },
      claimed: Claimed,
      verdict: Verdict
   ): Promise<DispatchResult> {
      const message = MESSAGES[verdict]
      const now = new Date().toISOString()

      try {
         await applyTaskResult(
            taskResultSchema.parse({
               contract: 1,
               task_id: session.id,
               task: session.task,
               task_version: session.taskVersion ?? 1,
               status: 'FAILED',
               verdict,
               message,
               artifacts: [],
               artifacts_truncated: false,
               worker: { build: 'brain' },
               started_at: session.startedAt.toISOString(),
               finished_at: now,
            })
         )
      } catch (error) {
         console.error(
            `worker task-dispatch could not end ${session.task} ${session.id} as ${verdict}: ${(error as Error).name}`
         )

         if (claimed.giveUpFailures + 1 < MAX_GIVE_UP_FAILURES) {
            await PrismaService.client.$executeRawUnsafe(
               `UPDATE "TaskDispatch"
                SET "giveUpFailures" = "giveUpFailures" + 1,
                    "nextAttemptAt" = ${NOW} + $2::float8 * interval '1 millisecond',
                    "claimedUntil" = NULL
                WHERE "sessionId" = $1`,
               session.id,
               BACKOFF_MS[Math.min(claimed.giveUpFailures + 1, BACKOFF_MS.length - 1)]
            )

            return { outcome: 'retry' }
         }

         await SpiderSessionService.fail(session.id, message, verdict)
      }

      await this.remove(session.id)
      console.error(`worker task-dispatch gave up on ${session.task} ${session.id}: ${verdict}`)

      return { outcome: 'gave-up' }
   }
}
