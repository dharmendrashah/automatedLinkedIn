import { SESSION_RECORDING_RETENTION_DAYS } from 'env'

import { type ProxyProtocol, type SpiderSessionStatus } from 'generated/prisma/client'

import { type ValidateAccountResult } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'

const DAY_MS = 24 * 60 * 60 * 1000

// A row is kept this long. The recording it points to lives for SESSION_RECORDING_RETENTION_DAYS (and is deleted
// from the bucket by its lifecycle rule), after which the row says so.
const ROW_RETENTION_DAYS = 30

const PAGE_SIZE = 20

// A check that has not been answered after the account lease would have run out is shown as "No answer".
const NO_ANSWER_AFTER_MS = 30 * 60 * 1000

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

type SessionProxy = {
   id: string
   protocol: ProxyProtocol
   host: string
   port: number
   country: string | null
}

type StartInput = {
   id: string
   userId: string
   linkedInAccountId: string
   email: string
   proxy: SessionProxy
   retryOfId?: string
}

type SessionRequestParams = {
   action: 'VALIDATE_ACCOUNT'
   email: string
   proxy: string
}

const listSelect = {
   id: true,
   kind: true,
   status: true,
   outcome: true,
   message: true,
   proxyProtocol: true,
   proxyHost: true,
   proxyPort: true,
   proxyCountry: true,
   startedAt: true,
   finishedAt: true,
   durationMs: true,
   recordingPrefix: true,
   retryOfId: true,
   linkedInAccount: {
      select: {
         id: true,
         email: true,
      },
   },
} as const

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

// One session is one run of the spider for one of the user's accounts. See .plan/spider-session-recording.md.
export class SpiderSessionService {
   // Notes that a check was queued. The check is already on its way, so a failure here is logged, never thrown.
   public static async start({ id, userId, linkedInAccountId, email, proxy, retryOfId }: StartInput) {
      try {
         const params: SessionRequestParams = {
            action: 'VALIDATE_ACCOUNT',
            email,
            proxy: `${proxy.protocol.toLowerCase()}://${proxy.host}:${proxy.port}`,
         }

         await PrismaService.client.spiderSession.create({
            data: {
               id,
               userId,
               linkedInAccountId,
               kind: 'VALIDATE_ACCOUNT',
               proxyServerId: proxy.id,
               proxyProtocol: proxy.protocol,
               proxyHost: proxy.host,
               proxyPort: proxy.port,
               proxyCountry: proxy.country,
               requestParams: params,
               ...(retryOfId && { retryOfId }),
            },
         })
         const cutoff = new Date(Date.now() - ROW_RETENTION_DAYS * DAY_MS)

         await PrismaService.client.spiderSession.deleteMany({ where: { startedAt: { lt: cutoff } } })
      } catch (error) {
         console.error(`Could not save the session ${id}: ${(error as Error).message}`)
      }
   }

   // The check could not even be queued.
   public static async fail(id: string, message: string) {
      await PrismaService.client.spiderSession.updateMany({
         where: {
            id,
            status: 'IN_PROGRESS',
         },
         data: {
            status: 'FAILED',
            outcome: 'ERROR',
            message,
            finishedAt: new Date(),
         },
      })
   }

   // Records the worker's answer, once. Resolves to whether this answer was the one that ended the session.
   public static async finish(result: ValidateAccountResult) {
      const session = await PrismaService.client.spiderSession.findUnique({
         where: { id: result.validation_id },
         select: { startedAt: true },
      })

      if (!session) {
         return false
      }

      const finishedAt = new Date(result.checked_at)
      const { count } = await PrismaService.client.spiderSession.updateMany({
         where: {
            id: result.validation_id,
            status: 'IN_PROGRESS',
         },
         data: {
            status: result.outcome === 'VALID' ? 'SUCCEEDED' : 'FAILED',
            outcome: result.outcome,
            message: result.message,
            finishedAt,
            durationMs: Math.max(0, finishedAt.getTime() - session.startedAt.getTime()),
            ...(result.recording_prefix && { recordingPrefix: result.recording_prefix }),
         },
      })

      return count > 0
   }

   // A page of the user's sessions, newest first. `cursor` is the id of the last session of the previous page.
   public static async listForUser(
      userId: string,
      {
         accountId,
         status,
         cursor,
      }: {
         accountId?: string
         status?: SpiderSessionStatus
         cursor?: string
      }
   ) {
      const rows = await PrismaService.client.spiderSession.findMany({
         where: {
            userId,
            ...(accountId && { linkedInAccountId: accountId }),
            ...(status && { status }),
         },
         orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
         take: PAGE_SIZE + 1,
         ...(cursor && {
            cursor: { id: cursor },
            skip: 1,
         }),
         select: listSelect,
      })
      const page = rows.slice(0, PAGE_SIZE)

      return {
         items: page.map(present),
         nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : undefined,
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
      }
   }

   // Where one file of the user's own session lives in the bucket, for a signed link.
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
