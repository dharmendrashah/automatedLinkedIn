import { SESSION_RECORDING_RETENTION_DAYS } from 'env'

import { type Prisma, type ProxyProtocol, type SpiderSessionStatus } from 'generated/prisma/client'

import {
   type TaskReport,
   type TaskResult,
   type TaskTrigger,
   artifactPathUnder,
   runPrefix,
} from '@automatedLinkedIn/contracts'

import { BrowseBudgetService } from './browseBudget.service'
import { PrismaService } from './prisma.service'
import { NO_ANSWER_AFTER_MS, type SessionFilters, sessionWhere, without } from './spiderSessionFilters'
import { type FinishedSession } from './taskHooks'

const DAY_MS = 24 * 60 * 60 * 1000

// A row is kept this long. The recording it points to lives for SESSION_RECORDING_RETENTION_DAYS (and is deleted
// from the bucket by its lifecycle rule), after which the row says so.
const ROW_RETENTION_DAYS = 30

const PAGE_SIZE = 50
// New runs handed to an open Sessions page in one refresh; more wait for the next one.
const CHANGES_MAX = 100

export type SessionSort = { by: 'startedAt' | 'durationMs'; desc: boolean }

export type SessionQuery = SessionFilters & {
   sort?: SessionSort
   // How many rows the page already holds; new runs above may repeat a few, which the page drops by id.
   cursor?: number
}

// The only files of a recording the browser may ask for. The path itself always comes from the database.
export const SESSION_FILE_PATTERN =
   /^(?:video\.webm|timeline\.json|network\.json|logs\.json|failure\.html|screenshots\/\d{2,3}-[A-Za-z-]+\.png)$/

export class SpiderSessionNotFoundError extends Error {
   public constructor() {
      super('Session not found')
   }
}

export class SpiderRecordingUnavailableError extends Error {
   public constructor(message: string) {
      super(message)
   }
}

// A file with login tokens in it is only handed out when the owner asked for it on purpose.
export class SpiderSensitiveFileError extends Error {
   public constructor() {
      super('This file holds login tokens. Open it on purpose to see it.')
   }
}

type SessionProxy = {
   id: string
   protocol: ProxyProtocol
   host: string
   port: number
   country: string | null
}

type StartTaskInput = {
   id: string
   userId: string
   linkedInAccountId: string
   proxy?: SessionProxy
   task: string
   taskVersion: number
   trigger: TaskTrigger
   input: Record<string, unknown>
   // The time of the command, which the worker uses for the folder of the run.
   startedAt: Date
   retryOfId?: string
}

type SessionRequestParams =
   | {
        action: 'VALIDATE_ACCOUNT'
        email: string
        proxy: string
     }
   | {
        action: 'TASK'
        task: string
        taskVersion: number
        trigger: TaskTrigger
        input: Record<string, unknown>
        proxy: string | null
     }

const listSelect = {
   id: true,
   kind: true,
   status: true,
   outcome: true,
   message: true,
   task: true,
   verdict: true,
   proxyProtocol: true,
   proxyHost: true,
   proxyPort: true,
   proxyCountry: true,
   startedAt: true,
   finishedAt: true,
   durationMs: true,
   recordingPrefix: true,
   retryOfId: true,
   trigger: true,
   taskVersion: true,
   workerBuild: true,
   proxyServerId: true,
   linkedInAccount: {
      select: {
         id: true,
         email: true,
         displayName: true,
         imageUrl: true,
      },
   },
   // Which kinds of file the run kept (video, screenshot, log, network, session…), not the files.
   artifacts: {
      select: { kind: true },
      distinct: ['kind'],
   },
   _count: { select: { retries: true } },
} satisfies Prisma.SpiderSessionSelect

type ListRow = Prisma.SpiderSessionGetPayload<{ select: typeof listSelect }>

const orderOf = ({ by, desc }: SessionSort): Prisma.SpiderSessionOrderByWithRelationInput[] => {
   const direction = desc ? 'desc' : 'asc'

   return by === 'durationMs'
      ? [
           {
              durationMs: {
                 sort: direction,
                 nulls: 'last',
              },
           },
           { startedAt: 'desc' },
           { id: 'desc' },
        ]
      : [{ startedAt: direction }, { id: direction }]
}

// The row as the page needs it: no bucket path, whether a recording exists, and whether the check never answered.
const present = <T extends { recordingPrefix: string | null; startedAt: Date; status: SpiderSessionStatus }>(
   row: T
) => {
   const { recordingPrefix, ...rest } = row
   const recordingExpiresAt = new Date(row.startedAt.getTime() + SESSION_RECORDING_RETENTION_DAYS * DAY_MS)

   return {
      ...rest,
      hasRecording: recordingPrefix !== null,
      recordingExpiresAt,
      recordingExpired: recordingExpiresAt.getTime() < Date.now(),
      noAnswer: row.status === 'IN_PROGRESS' && Date.now() - row.startedAt.getTime() > NO_ANSWER_AFTER_MS,
   }
}

// A row of the Sessions table: the kinds of file it kept and how often it was retried, instead of the raw relations.
const presentRow = (row: ListRow) => {
   const { artifacts, _count, workerBuild, ...rest } = present(row)

   return {
      ...rest,
      workerBuild: workerBuild?.slice(0, 7) ?? null,
      files: artifacts.map(({ kind }) => kind),
      retriesCount: _count.retries,
   }
}

const countsOf = <K extends string>(rows: Array<Record<K, string | null> & { _count: { _all: number } }>, key: K) =>
   rows.flatMap(row => {
      const value = row[key]

      return value === null
         ? []
         : [
              {
                 value,
                 count: row._count._all,
              },
           ]
   })

// One session is one run of the spider for one of the user's accounts. See .plan/spider-session-recording.md.
export class SpiderSessionService {
   // Notes a task that is about to be queued. Unlike `start` it throws when the row cannot be saved: a run nobody can see
   // the result of must not happen. `client` is the transaction the task is saved in.
   public static async startTask(
      { id, userId, linkedInAccountId, proxy, task, taskVersion, trigger, input, startedAt, retryOfId }: StartTaskInput,
      client: Prisma.TransactionClient = PrismaService.client
   ) {
      const params: SessionRequestParams = {
         action: 'TASK',
         task,
         taskVersion,
         trigger,
         input,
         proxy: proxy ? `${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port}` : null,
      }

      await client.spiderSession.create({
         data: {
            id,
            userId,
            linkedInAccountId,
            kind: 'TASK',
            task,
            taskVersion,
            trigger,
            startedAt,
            ...(proxy && {
               proxyServerId: proxy.id,
               proxyProtocol: proxy.protocol,
               proxyHost: proxy.host,
               proxyPort: proxy.port,
               proxyCountry: proxy.country,
            }),
            requestParams: params as unknown as Prisma.InputJsonObject,
            ...(retryOfId && { retryOfId }),
         },
      })
   }

   // Deletes sessions past their retention. Best effort: it runs after a task was saved, never inside its transaction,
   // where a failed statement would fail the whole save.
   public static async deleteExpired() {
      try {
         const cutoff = new Date(Date.now() - ROW_RETENTION_DAYS * DAY_MS)

         await PrismaService.client.spiderSession.deleteMany({ where: { startedAt: { lt: cutoff } } })
      } catch (error) {
         console.error(`Could not delete old sessions: ${(error as Error).message}`)
      }
   }

   // The check could not even be queued.
   public static async fail(id: string, message: string, verdict?: string) {
      await BrowseBudgetService.release(id).catch(() => undefined)
      await PrismaService.client.spiderSession.updateMany({
         where: {
            id,
            status: 'IN_PROGRESS',
         },
         data: {
            status: 'FAILED',
            outcome: 'ERROR',
            ...(verdict && { verdict }),
            message,
            finishedAt: new Date(),
         },
      })
   }

   // Records a task's answer once, with the files it names. Only a file under the folder brain computes for this run is kept,
   // so a result can never point at someone else's files. Resolves to the session that this answer finished, or null when it
   // finished nothing (unknown, already finished, or another task's). `after` runs inside the same transaction once the
   // session is finished, so what it changes is saved with it or not at all.
   public static async finishTask(
      result: TaskResult,
      after?: (session: FinishedSession, tx: Prisma.TransactionClient) => Promise<void>
   ) {
      const session = await PrismaService.client.spiderSession.findFirst({
         where: {
            id: result.task_id,
            kind: 'TASK',
            status: 'IN_PROGRESS',
         },
         select: {
            id: true,
            userId: true,
            linkedInAccountId: true,
            task: true,
            startedAt: true,
         },
      })

      if (!session || session.task !== result.task) {
         return null
      }

      const prefix = runPrefix({
         task: result.task,
         user_id: session.userId,
         requested_at: session.startedAt.toISOString(),
         task_id: result.task_id,
      })
      const kept = result.artifacts.filter(({ path }) => artifactPathUnder(prefix, path))

      if (kept.length < result.artifacts.length) {
         console.error(
            `Dropped ${result.artifacts.length - kept.length} file(s) of ${result.task_id} outside its folder`
         )
      }

      const finishedAt = new Date(result.finished_at)
      const finished = await PrismaService.client.$transaction(async tx => {
         const { count } = await tx.spiderSession.updateMany({
            where: {
               id: result.task_id,
               status: 'IN_PROGRESS',
            },
            data: {
               status: result.status,
               outcome: result.verdict,
               verdict: result.verdict,
               message: result.message,
               ...(result.report && { report: result.report }),
               workerBuild: result.worker.build,
               finishedAt,
               durationMs: Math.max(0, finishedAt.getTime() - session.startedAt.getTime()),
               ...(kept.length > 0 && { recordingPrefix: prefix }),
            },
         })

         if (count === 0) {
            return false
         }

         if (kept.length > 0) {
            await tx.spiderSessionArtifact.createMany({
               data: kept.map(file => ({
                  sessionId: result.task_id,
                  kind: file.kind,
                  name: file.name,
                  path: file.path,
                  contentType: file.content_type,
                  bytes: file.bytes,
                  step: file.step ?? null,
                  sensitive: file.sensitive ?? false,
               })),
               skipDuplicates: true,
            })
         }

         await after?.(
            {
               id: session.id,
               userId: session.userId,
               linkedInAccountId: session.linkedInAccountId,
            },
            tx
         )

         return true
      })

      return finished
         ? {
              id: session.id,
              userId: session.userId,
              linkedInAccountId: session.linkedInAccountId,
           }
         : null
   }

   // A page of the user's sessions under the Sessions page's filters, newest first unless sorted otherwise.
   public static async listForUser(userId: string, { sort, cursor = 0, ...filters }: SessionQuery) {
      const rows = await PrismaService.client.spiderSession.findMany({
         where: sessionWhere(userId, filters),
         orderBy: orderOf(
            sort ?? {
               by: 'startedAt',
               desc: true,
            }
         ),
         skip: cursor,
         take: PAGE_SIZE + 1,
         select: listSelect,
      })

      return {
         items: rows.slice(0, PAGE_SIZE).map(presentRow),
         nextCursor: rows.length > PAGE_SIZE ? cursor + PAGE_SIZE : undefined,
      }
   }

   // What changed for an open Sessions page: runs newer than `since` under its filters, and the rows it watches (still running when
   // it last looked) as they are now.
   public static async changes(userId: string, filters: SessionFilters, since: Date, watch: string[]) {
      const db = PrismaService.client
      const [fresh, updated] = await Promise.all([
         db.spiderSession.findMany({
            where: { AND: [sessionWhere(userId, filters), { startedAt: { gt: since } }] },
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
            take: CHANGES_MAX,
            select: listSelect,
         }),
         watch.length > 0
            ? db.spiderSession.findMany({
                 where: {
                    userId,
                    id: { in: watch },
                 },
                 select: listSelect,
              })
            : Promise.resolve([]),
      ])

      return {
         fresh: fresh.map(presentRow),
         updated: updated.map(presentRow),
      }
   }

   // How many sessions each value of a filter would show, with the other filters on, for the Filters drawer.
   public static async facets(userId: string, filters: SessionFilters) {
      const db = PrismaService.client
      const where = (key: keyof SessionFilters) => sessionWhere(userId, without(filters, key))
      const [accounts, tasks, verdicts, triggers, countries, proxies, statuses, running, unanswered] =
         await Promise.all([
            db.spiderSession.groupBy({
               by: ['linkedInAccountId'],
               where: where('accountIds'),
               _count: { _all: true },
            }),
            db.spiderSession.groupBy({
               by: ['task'],
               where: where('tasks'),
               _count: { _all: true },
            }),
            db.spiderSession.groupBy({
               by: ['verdict'],
               where: where('verdicts'),
               _count: { _all: true },
            }),
            db.spiderSession.groupBy({
               by: ['trigger'],
               where: where('triggers'),
               _count: { _all: true },
            }),
            db.spiderSession.groupBy({
               by: ['proxyCountry'],
               where: where('proxyCountries'),
               _count: { _all: true },
            }),
            db.spiderSession.groupBy({
               by: ['proxyServerId'],
               where: where('proxyIds'),
               _count: { _all: true },
            }),
            db.spiderSession.groupBy({
               by: ['status'],
               where: where('results'),
               _count: { _all: true },
            }),
            db.spiderSession.count({
               where: sessionWhere(userId, {
                  ...without(filters, 'results'),
                  results: ['IN_PROGRESS'],
               }),
            }),
            db.spiderSession.count({
               where: sessionWhere(userId, {
                  ...without(filters, 'results'),
                  results: ['NO_ANSWER'],
               }),
            }),
         ])
      const ended = countsOf(statuses, 'status').filter(({ value }) => value !== 'IN_PROGRESS')

      return {
         accounts: countsOf(accounts, 'linkedInAccountId'),
         tasks: countsOf(tasks, 'task'),
         verdicts: countsOf(verdicts, 'verdict'),
         triggers: countsOf(triggers, 'trigger'),
         proxyCountries: countsOf(countries, 'proxyCountry'),
         proxies: countsOf(proxies, 'proxyServerId'),
         results: [
            ...ended,
            {
               value: 'IN_PROGRESS',
               count: running,
            },
            {
               value: 'NO_ANSWER',
               count: unanswered,
            },
         ],
      }
   }

   public static async getForUser(userId: string, id: string) {
      const row = await PrismaService.client.spiderSession.findFirst({
         where: {
            id,
            userId,
         },
         select: {
            ...listSelect,
            requestParams: true,
            proxyServerId: true,
            taskVersion: true,
            trigger: true,
            report: true,
            workerBuild: true,
            // Never the bucket path: a file is opened through its id.
            artifacts: {
               orderBy: [{ kind: 'asc' }, { name: 'asc' }],
               select: {
                  id: true,
                  kind: true,
                  name: true,
                  contentType: true,
                  bytes: true,
                  step: true,
                  sensitive: true,
               },
            },
            retries: {
               orderBy: { startedAt: 'desc' },
               select: {
                  id: true,
                  startedAt: true,
               },
            },
         },
      })

      if (!row) {
         throw new SpiderSessionNotFoundError()
      }

      // The column only ever holds what `start` wrote. Prisma's recursive Json type would make the API's output too
      // deep for the web app to infer.
      return {
         ...present(row),
         requestParams: row.requestParams as unknown as SessionRequestParams,
         report: row.report as unknown as TaskReport | null,
      }
   }

   // Where one file of the user's own task session lives in the bucket, for a signed link.
   public static async artifactKey(userId: string, id: string, artifactId: string, reveal = false) {
      const row = await PrismaService.client.spiderSessionArtifact.findFirst({
         where: {
            id: artifactId,
            sessionId: id,
            session: { userId },
         },
         select: {
            path: true,
            sensitive: true,
            session: { select: { startedAt: true } },
         },
      })

      if (!row) {
         throw new SpiderSessionNotFoundError()
      }

      if (row.sensitive && !reveal) {
         throw new SpiderSensitiveFileError()
      }

      if (row.session.startedAt.getTime() + SESSION_RECORDING_RETENTION_DAYS * DAY_MS < Date.now()) {
         throw new SpiderRecordingUnavailableError(
            `These files expired after ${SESSION_RECORDING_RETENTION_DAYS} days.`
         )
      }

      return row.path
   }

   // Where one file of the user's own account check lives in the bucket, for a signed link.
   public static async fileKey(userId: string, id: string, file: string) {
      const row = await PrismaService.client.spiderSession.findFirst({
         where: {
            id,
            userId,
         },
         select: {
            recordingPrefix: true,
            startedAt: true,
         },
      })

      if (!row || !SESSION_FILE_PATTERN.test(file)) {
         throw new SpiderSessionNotFoundError()
      }

      if (!row.recordingPrefix) {
         throw new SpiderRecordingUnavailableError('This session was not recorded.')
      }

      if (row.startedAt.getTime() + SESSION_RECORDING_RETENTION_DAYS * DAY_MS < Date.now()) {
         throw new SpiderRecordingUnavailableError(
            `This recording expired after ${SESSION_RECORDING_RETENTION_DAYS} days.`
         )
      }

      return `${row.recordingPrefix}/${file}`
   }
}
