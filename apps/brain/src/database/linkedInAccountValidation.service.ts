import { randomUUID } from 'node:crypto'

import { AccountValidationQueue } from 'core'

import { type ValidateAccountResult } from '@automatedLinkedIn/contracts'

import { LinkedInAccountService } from './linkedInAccount.service'
import { PrismaService } from './prisma.service'
import { ProxyServerService } from './proxyServer.service'

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

// Brain asks the worker to check an account's credentials, and applies the answer to the account's status.
export class LinkedInAccountValidationService {
   // Notes a new validation on the account, then queues it. A failed publish does not fail the caller: the
   // account just stays PENDING and the owner can verify again. Resolves to whether the task was queued.
   public static async request(accountId: string) {
      const row = await PrismaService.client.linkedInAccount.findUnique({
         where: { id: accountId },
         select: {
            id: true,
            email: true,
            secret: true,
            secretIv: true,
            secretTag: true,
            keyVersion: true,
            status: true,
         },
      })

      if (!row || row.status === 'DISABLED') {
         return false
      }

      const proxy = await ProxyServerService.pickForAccount(row.id)

      if (!proxy) {
         // Never log in from this server's own network: wait until the owner adds a proxy that works.
         await PrismaService.client.linkedInAccount.update({
            where: { id: row.id },
            data: {
               statusMessage: NEEDS_PROXY_MESSAGE,
               statusUpdatedAt: new Date(),
            },
         })

         return false
      }

      const requestedAt = new Date()
      const validationId = randomUUID()

      await PrismaService.client.linkedInAccount.update({
         where: { id: row.id },
         data: {
            validationId,
            validationRequestedAt: requestedAt,
         },
      })

      try {
         await AccountValidationQueue.publish({
            validation_id: validationId,
            account_id: row.id,
            email: row.email,
            // Forwarded as stored: brain never decrypts it to publish, only the worker can open it.
            sealed: {
               ciphertext: row.secret,
               iv: row.secretIv,
               tag: row.secretTag,
               key_version: row.keyVersion,
            },
            proxy,
            requested_at: requestedAt.toISOString(),
         })

         return true
      } catch (error) {
         console.error(`Could not queue the validation of account ${row.id}: ${(error as Error).message}`)

         return false
      }
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
      await this.request(row.id)

      return LinkedInAccountService.getForUser(userId, id)
   }

   // Applies the worker's answer. One conditional update does the whole check: the account must still be waiting for
   // this very validation (so an old or repeated answer changes nothing) and must not have been paused meanwhile.
   // Resolves to whether the answer was used.
   public static async applyResult(result: ValidateAccountResult) {
      const now = new Date()

      const outcome =
         result.outcome === 'VALID'
            ? {
                 status: 'ACTIVE' as const,
                 statusMessage: null,
                 lastVerifiedAt: now,
              }
            : {
                 status: result.outcome === 'ERROR' ? ('ERROR' as const) : ('NEEDS_REAUTH' as const),
                 statusMessage: result.message,
              }

      const { count } = await PrismaService.client.linkedInAccount.updateMany({
         where: {
            id: result.account_id,
            validationId: result.validation_id,
            status: { not: 'DISABLED' },
         },
         data: {
            ...outcome,
            statusUpdatedAt: now,
            validationId: null,
         },
      })

      return count > 0
   }
}
