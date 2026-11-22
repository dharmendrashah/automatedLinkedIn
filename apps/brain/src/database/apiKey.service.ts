import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { ConflictError, uniqueOr } from './conflict'
import { PrismaService } from './prisma.service'

// Account-level API keys (.plan/api-authentication-and-openapi-docs.md): let a user call the whole API as
// themselves with a key instead of an authentik session token. Only the SHA-256 hash is stored; the key is shown
// once. `keyPrefix` is the first 11 characters in the clear, used to find the matching row without scanning every
// key's hash; the full hash is still compared in constant time before a key is trusted.

export const API_KEY_PREFIX = 'alk_'
const PREFIX_LENGTH = 11
const MAX_LIVE_KEYS = 20

const digest = (key: string) => createHash('sha256').update(key).digest()

const DAYS_MS = 24 * 60 * 60 * 1000

export class ApiKeyService {
   // A new key, shown once. Throws ConflictError past the live-key cap or on a duplicate name for this user.
   public static async create(userId: string, name: string, expiresInDays: 30 | 90 | 365 | null) {
      const live = await PrismaService.client.apiKey.count({
         where: {
            userId,
            revokedAt: null,
         },
      })

      if (live >= MAX_LIVE_KEYS) {
         throw new ConflictError(`At most ${MAX_LIVE_KEYS} live keys at a time.`)
      }

      const key = API_KEY_PREFIX + randomBytes(32).toString('base64url')
      const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * DAYS_MS) : null

      const row = await uniqueOr(
         PrismaService.client.apiKey.create({
            data: {
               userId,
               name,
               keyHash: digest(key).toString('hex'),
               keyPrefix: key.slice(0, PREFIX_LENGTH),
               expiresAt,
            },
         }),
         'A key with this name already exists.'
      )

      return {
         key,
         row,
      }
   }

   // Every key for the user, newest first. Never the hash or the full key.
   public static list(userId: string) {
      return PrismaService.client.apiKey.findMany({
         where: { userId },
         orderBy: { createdAt: 'desc' },
         select: {
            id: true,
            name: true,
            keyPrefix: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
            lastUsedAt: true,
         },
      })
   }

   // Marks a key revoked, once. Idempotent; false when it is not the owner's key or already revoked.
   public static async revoke(userId: string, id: string) {
      const { count } = await PrismaService.client.apiKey.updateMany({
         where: {
            id,
            userId,
            revokedAt: null,
         },
         data: { revokedAt: new Date() },
      })

      return count === 1
   }

   // The id of the user a live, unexpired key belongs to, or null. Compared in constant time; touches lastUsedAt
   // best-effort (never blocks or fails the caller on that write).
   public static async authenticate(key: string, now = new Date()) {
      if (!key.startsWith(API_KEY_PREFIX)) {
         return null
      }

      const candidates = await PrismaService.client.apiKey.findMany({
         where: { keyPrefix: key.slice(0, PREFIX_LENGTH) },
         select: {
            id: true,
            userId: true,
            keyHash: true,
            revokedAt: true,
            expiresAt: true,
         },
      })
      const given = digest(key)
      const match = candidates.find(candidate => {
         const expected = Buffer.from(candidate.keyHash, 'hex')

         return expected.length === given.length && timingSafeEqual(expected, given)
      })

      if (!match || match.revokedAt || (match.expiresAt && match.expiresAt <= now)) {
         return null
      }

      void PrismaService.client.apiKey.update({
         where: { id: match.id },
         data: { lastUsedAt: now },
      })

      return match.userId
   }
}
