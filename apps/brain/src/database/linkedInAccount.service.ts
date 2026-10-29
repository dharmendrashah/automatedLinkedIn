import { CryptoService, KeptFiles } from 'core'

import { type Prisma } from 'generated/prisma/client'

import { PostDraftService } from './postDraft.service'
import { PostPublicationService } from './postPublication.service'
import { PrismaService } from './prisma.service'

export type LinkedInSecrets = {
   password?: string
   totpSecret?: string
   session?: string
}

// The spider task that looks around an account once a day.
export const VISIT_TASK = 'linkedin-browse'

// undefined leaves a field unchanged; null or '' clears it; a string sets it.
export type LinkedInSecretsPatch = {
   password?: string | null
   totpSecret?: string | null
   session?: string | null
}

export class LinkedInAccountConflictError extends Error {
   public constructor() {
      super('A LinkedIn account with this email is already stored')
   }
}

export class LinkedInCredentialsError extends Error {}

// An account needs a password or a browser cookie. A two-step key is only a second step after a password.
const assertCredentials = (secrets: LinkedInSecrets) => {
   if (!secrets.password && !secrets.session) {
      throw new LinkedInCredentialsError('Add a password or a browser sign-in token (li_at).')
   }

   if (secrets.totpSecret && !secrets.password) {
      throw new LinkedInCredentialsError('A two-step verification key needs the password too.')
   }
}

// Fields safe to return over the API: the row without any secret material.
const metadataSelect = {
   id: true,
   email: true,
   hasPassword: true,
   hasTotp: true,
   hasSession: true,
   status: true,
   statusMessage: true,
   statusUpdatedAt: true,
   lastVerifiedAt: true,
   nextBrowseAt: true,
   // The name and picture LinkedIn showed for the account; null until its messages were read.
   displayName: true,
   imageUrl: true,
   // When each first read was done (.plan/first-day-reads.md); null while it is still to come.
   profileAskedAt: true,
   invitationsReadAt: true,
   connectionsReadAt: true,
   messagesBackfilledAt: true,
   createdAt: true,
   updatedAt: true,
} satisfies Prisma.LinkedInAccountSelect

type SealedRow = {
   secret: string
   secretIv: string
   secretTag: string
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002'

const clean = (secrets: LinkedInSecrets): LinkedInSecrets => ({
   ...(secrets.password ? { password: secrets.password } : {}),
   ...(secrets.totpSecret ? { totpSecret: secrets.totpSecret } : {}),
   ...(secrets.session ? { session: secrets.session } : {}),
})

const seal = (secrets: LinkedInSecrets) => {
   const cleaned = clean(secrets)
   const sealed = CryptoService.seal(JSON.stringify(cleaned))

   return {
      secret: sealed.ciphertext,
      secretIv: sealed.iv,
      secretTag: sealed.tag,
      keyVersion: 1,
      hasPassword: Boolean(cleaned.password),
      hasTotp: Boolean(cleaned.totpSecret),
      hasSession: Boolean(cleaned.session),
   }
}

const open = (row: SealedRow): LinkedInSecrets =>
   JSON.parse(
      CryptoService.open({
         ciphertext: row.secret,
         iv: row.secretIv,
         tag: row.secretTag,
      })
   ) as LinkedInSecrets

const applyPatch = (current: LinkedInSecrets, patch: LinkedInSecretsPatch): LinkedInSecrets => {
   const next = { ...current }

   for (const key of ['password', 'totpSecret', 'session'] as const) {
      const value = patch[key]

      if (value === undefined) continue

      if (value) {
         next[key] = value
      } else {
         delete next[key]
      }
   }

   return next
}

export class LinkedInAccountService {
   public static async create(userId: string, email: string, secrets: LinkedInSecrets) {
      assertCredentials(clean(secrets))

      try {
         return await PrismaService.client.linkedInAccount.create({
            data: {
               userId,
               email,
               ...seal(secrets),
            },
            select: metadataSelect,
         })
      } catch (error) {
         if (isUniqueViolation(error)) {
            throw new LinkedInAccountConflictError()
         }

         throw error
      }
   }

   public static async listForUser(userId: string) {
      const accounts = await PrismaService.client.linkedInAccount.findMany({
         where: { userId },
         orderBy: { createdAt: 'asc' },
         select: metadataSelect,
      })
      // The newest visit of each account, in one query for all of them.
      const visits = await PrismaService.client.spiderSession.findMany({
         where: {
            userId,
            task: VISIT_TASK,
            linkedInAccountId: { in: accounts.map(({ id }) => id) },
         },
         distinct: ['linkedInAccountId'],
         orderBy: { startedAt: 'desc' },
         select: {
            id: true,
            linkedInAccountId: true,
            status: true,
            verdict: true,
            message: true,
            trigger: true,
            startedAt: true,
            finishedAt: true,
         },
      })

      return accounts.map(account => {
         const found = visits.find(({ linkedInAccountId }) => linkedInAccountId === account.id)

         return {
            ...account,
            lastVisit: found
               ? {
                    id: found.id,
                    status: found.status,
                    verdict: found.verdict,
                    message: found.message,
                    trigger: found.trigger,
                    startedAt: found.startedAt,
                    finishedAt: found.finishedAt,
                 }
               : null,
         }
      })
   }

   public static getForUser(userId: string, id: string) {
      return PrismaService.client.linkedInAccount.findFirst({
         where: {
            id,
            userId,
         },
         select: metadataSelect,
      })
   }

   // Decrypted secrets for an account the user owns, or null. Used by the reveal mutation and,
   // server-side, by the automation layer. Never log the result.
   public static async revealForUser(userId: string, id: string) {
      const row = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id,
            userId,
         },
      })

      if (!row) {
         return null
      }

      return {
         email: row.email,
         secrets: open(row),
      }
   }

   public static async updateForUser(
      userId: string,
      id: string,
      changes: { email?: string; secrets?: LinkedInSecretsPatch }
   ) {
      const row = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id,
            userId,
         },
      })

      if (!row) {
         return null
      }

      const secrets = changes.secrets ? applyPatch(open(row), changes.secrets) : open(row)

      if (changes.secrets) {
         assertCredentials(secrets)
      }

      // New secrets or a new login email invalidate the last verification, but never un-pause an account the owner
      // disabled.
      const secretsChanged = Object.values(changes.secrets ?? {}).some(value => value !== undefined)
      const emailChanged = changes.email !== undefined && changes.email !== row.email
      const reset = (secretsChanged || emailChanged) && row.status !== 'DISABLED'

      try {
         return await PrismaService.client.linkedInAccount.update({
            where: { id: row.id },
            data: {
               ...(changes.email ? { email: changes.email } : {}),
               ...seal(secrets),
               ...(reset
                  ? {
                       status: 'PENDING' as const,
                       statusMessage: null,
                       statusUpdatedAt: new Date(),
                       lastVerifiedAt: null,
                    }
                  : {}),
            },
            select: metadataSelect,
         })
      } catch (error) {
         if (isUniqueViolation(error)) {
            throw new LinkedInAccountConflictError()
         }

         throw error
      }
   }

   // Owner pause switch. Resume only lifts DISABLED, back to PENDING (it must be verified again).
   public static async setPausedForUser(userId: string, id: string, paused: boolean) {
      const row = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id,
            userId,
         },
         select: metadataSelect,
      })

      if (!row) {
         return null
      }

      if (!paused && row.status !== 'DISABLED') {
         return row
      }

      return PrismaService.client.linkedInAccount.update({
         where: { id: row.id },
         data: paused
            ? {
                 status: 'DISABLED',
                 statusMessage: 'Paused by you',
                 statusUpdatedAt: new Date(),
              }
            : {
                 status: 'PENDING',
                 statusMessage: null,
                 statusUpdatedAt: new Date(),
              },
         select: metadataSelect,
      })
   }

   // Removing an account is the one time its conversations and kept files are deleted (.plan/unibox-keep-messages-and-files.md). The
   // files go first, so that a failure leaves the account in place to try again and never leaves files behind.
   public static async deleteForUser(userId: string, id: string) {
      await KeptFiles.removeAccount(userId, id)
      await PostDraftService.removeFilesOfAccount(userId, id)
      await PostPublicationService.removeFilesOfAccount(userId, id)

      const { count } = await PrismaService.client.linkedInAccount.deleteMany({
         where: {
            id,
            userId,
         },
      })

      return count > 0
   }
}
