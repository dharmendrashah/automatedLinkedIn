import { LinkedInAccountService } from './linkedInAccount.service'
import { PrismaService } from './prisma.service'
import { retryRefusal } from './sessionRetry'
import { TaskService } from './task.service'
import { TaskNeedsProxyError, TaskRefusedError } from './taskErrors'

const TASK = 'linkedin-login'

// Asking again right away would only repeat a login that LinkedIn may already be suspicious of.
const VERIFY_COOLDOWN_MS = 5 * 60 * 1000

const NEEDS_PROXY_MESSAGE = 'Add a proxy to verify this account.'

export class LinkedInAccountPausedError extends Error {
   public constructor() {
      super('Resume the account before verifying it.')
   }
}

export class LinkedInVerifyCooldownError extends Error {
   public readonly retryAfterSeconds: number

   public constructor(retryAfterSeconds: number) {
      super(`This account was checked a moment ago. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`)
      this.retryAfterSeconds = retryAfterSeconds
   }
}

// A session that cannot be tried again, with the reason in words the owner can read.
export class SessionRetryError extends Error {
   public readonly code: 'NOT_FOUND' | 'REFUSED'

   public constructor(code: 'NOT_FOUND' | 'REFUSED', message: string) {
      super(message)
      this.code = code
   }
}

type RequestOptions = {
   // Use this proxy of the account instead of the best one.
   proxyId?: string
   // The session this check retries.
   retryOfId?: string
   // The owner asked for it, as opposed to something about the account changing.
   asked?: boolean
}

// The account side of the LinkedIn sign-in check: when to ask for one, and what the owner may do. The check itself is the
// `linkedin-login` task, and what it changes in the account is in linkedInLogin.hooks.ts.
export class LinkedInAccountValidationService {
   private static async start(accountId: string, options: RequestOptions) {
      const row = await PrismaService.client.linkedInAccount.findUnique({
         where: { id: accountId },
         select: {
            id: true,
            userId: true,
            status: true,
         },
      })

      if (!row || row.status === 'DISABLED') {
         return null
      }

      try {
         return await TaskService.request({
            userId: row.userId,
            task: TASK,
            accountId: row.id,
            proxyId: options.proxyId,
            trigger: options.retryOfId ? 'retry' : options.asked ? 'manual' : 'automatic',
            ...(options.retryOfId && { retryOfId: options.retryOfId }),
         })
      } catch (error) {
         if (error instanceof TaskNeedsProxyError) {
            // Never log in from this server's own network: wait until the owner adds a proxy that works.
            await PrismaService.client.linkedInAccount.update({
               where: { id: row.id },
               data: {
                  statusMessage: NEEDS_PROXY_MESSAGE,
                  statusUpdatedAt: new Date(),
               },
            })
         } else if (!(error instanceof TaskRefusedError)) {
            console.error(`Could not request the check of account ${row.id}: ${(error as Error).message}`)
         }

         return null
      }
   }

   // Notes a new check on the account, then queues it. A refusal or a failed publish does not fail the caller: the account
   // just stays PENDING and the owner can verify again. Resolves to whether the task was queued.
   public static async request(accountId: string, options: RequestOptions = {}) {
      return (await this.start(accountId, options)) !== null
   }

   // A proxy just became healthy: validate the account if it was only waiting for one. An account that is active,
   // paused or already waiting for a result is left alone, so editing a proxy never re-logs-in a working account.
   public static async requestIfWaiting(accountId: string) {
      const row = await PrismaService.client.linkedInAccount.findUnique({
         where: { id: accountId },
         select: {
            status: true,
            validationId: true,
         },
      })

      if (!row || row.status !== 'PENDING' || row.validationId) {
         return false
      }

      return this.request(accountId)
   }

   // The owner asks for another check. Null when the account is not theirs.
   public static async verifyForUser(userId: string, id: string) {
      const row = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id,
            userId,
         },
         select: {
            id: true,
            status: true,
            validationRequestedAt: true,
         },
      })

      if (!row) {
         return null
      }

      if (row.status === 'DISABLED') {
         throw new LinkedInAccountPausedError()
      }

      if (row.validationRequestedAt) {
         const waitMs = row.validationRequestedAt.getTime() + VERIFY_COOLDOWN_MS - Date.now()

         if (waitMs > 0) {
            throw new LinkedInVerifyCooldownError(Math.ceil(waitMs / 1000))
         }
      }

      await PrismaService.client.linkedInAccount.update({
         where: { id: row.id },
         data: {
            status: 'PENDING',
            statusMessage: null,
            statusUpdatedAt: new Date(),
         },
      })
      await this.request(row.id, { asked: true })

      return LinkedInAccountService.getForUser(userId, id)
   }

   // The owner starts a session again through another proxy of the same account. Only the proxy can change; the
   // credentials are the account's current ones. Resolves to the new session's id.
   public static async retryForUser(userId: string, sessionId: string, proxyId: string) {
      const session = await PrismaService.client.spiderSession.findFirst({
         where: {
            id: sessionId,
            userId,
         },
         select: {
            kind: true,
            status: true,
            outcome: true,
            message: true,
            linkedInAccountId: true,
            linkedInAccount: {
               select: {
                  status: true,
                  validationId: true,
                  validationRequestedAt: true,
               },
            },
         },
      })

      if (!session) {
         throw new SessionRetryError('NOT_FOUND', 'Session not found')
      }

      const refusal = retryRefusal(session)

      if (refusal) {
         throw new SessionRetryError('REFUSED', refusal)
      }

      const { linkedInAccount: account, linkedInAccountId: accountId } = session

      if (account.status === 'DISABLED') {
         throw new LinkedInAccountPausedError()
      }

      if (account.validationId) {
         throw new SessionRetryError('REFUSED', 'A check of this account is already in progress.')
      }

      if (account.validationRequestedAt) {
         const waitMs = account.validationRequestedAt.getTime() + VERIFY_COOLDOWN_MS - Date.now()

         if (waitMs > 0) {
            throw new LinkedInVerifyCooldownError(Math.ceil(waitMs / 1000))
         }
      }

      const usable = await PrismaService.client.proxyServer.findFirst({
         where: {
            id: proxyId,
            linkedInAccountId: accountId,
            status: { in: ['ACTIVE', 'GEO_MISMATCH'] },
         },
         select: { id: true },
      })

      if (!usable) {
         throw new SessionRetryError(
            'REFUSED',
            'That proxy cannot be used for this account. Pick one of its working proxies.'
         )
      }

      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: {
            status: 'PENDING',
            statusMessage: null,
            statusUpdatedAt: new Date(),
         },
      })

      const started = await this.start(accountId, {
         proxyId,
         retryOfId: sessionId,
      })

      if (!started) {
         throw new SessionRetryError('REFUSED', 'The check could not be started. Try again in a moment.')
      }

      return { id: started.id }
   }
}
