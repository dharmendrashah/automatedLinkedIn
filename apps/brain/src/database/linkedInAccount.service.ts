import { CryptoService } from 'core'

import { type Prisma } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

export type LinkedInSecrets = {
   password?: string
   totpSecret?: string
   session?: string
}

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

   public static listForUser(userId: string) {
      return PrismaService.client.linkedInAccount.findMany({
         where: { userId },
         orderBy: { createdAt: 'asc' },
         select: metadataSelect,
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

   public static async deleteForUser(userId: string, id: string) {
      const { count } = await PrismaService.client.linkedInAccount.deleteMany({
         where: {
            id,
            userId,
         },
      })

      return count > 0
   }
}
