import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { API_KEY_PREFIX, ApiKeyService } from './apiKey.service'
import { ConflictError } from './conflict'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL.

let userId: string

describe('ApiKeyService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
   })

   afterAll(async () => {
      await PrismaService.client.user.delete({ where: { id: userId } })
   })

   it('creates a key, shows it once, and authenticates with it', async () => {
      const { key, row } = await ApiKeyService.create(userId, 'ci', null)

      expect(key.startsWith(API_KEY_PREFIX)).toBe(true)
      expect(row.keyPrefix).toBe(key.slice(0, 11))

      await expect(ApiKeyService.authenticate(key)).resolves.toBe(userId)
      await expect(ApiKeyService.authenticate(`${API_KEY_PREFIX}wrong`)).resolves.toBeNull()
   })

   it('rejects a duplicate name for the same user', async () => {
      await ApiKeyService.create(userId, 'dup', null)

      await expect(ApiKeyService.create(userId, 'dup', null)).rejects.toBeInstanceOf(ConflictError)
   })

   it('stops authenticating once revoked', async () => {
      const { key, row } = await ApiKeyService.create(userId, 'revoke-me', null)

      await expect(ApiKeyService.revoke(userId, row.id)).resolves.toBe(true)
      await expect(ApiKeyService.authenticate(key)).resolves.toBeNull()
      // Revoking again is a no-op, not an error.
      await expect(ApiKeyService.revoke(userId, row.id)).resolves.toBe(false)
   })

   it('does not authenticate a key past its expiry date', async () => {
      const { key } = await ApiKeyService.create(userId, 'expiring', 30)
      const past = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)

      await expect(ApiKeyService.authenticate(key, past)).resolves.toBeNull()
      await expect(ApiKeyService.authenticate(key)).resolves.toBe(userId)
   })

   it('never revokes another user\u2019s key', async () => {
      const other = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      const { row } = await ApiKeyService.create(userId, 'not-yours', null)

      await expect(ApiKeyService.revoke(other, row.id)).resolves.toBe(false)
      await PrismaService.client.user.delete({ where: { id: other } })
   })

   it('lists keys newest first, without the hash', async () => {
      const list = await ApiKeyService.list(userId)

      expect(list.length).toBeGreaterThan(0)
      expect(list[0]).not.toHaveProperty('keyHash')
   })

   it('rejects past the live-key cap', async () => {
      const capped = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id

      await Promise.all(Array.from({ length: 20 }, (_, i) => ApiKeyService.create(capped, `k${i}`, null)))

      await expect(ApiKeyService.create(capped, 'one-too-many', null)).rejects.toBeInstanceOf(ConflictError)
      await PrismaService.client.user.delete({ where: { id: capped } })
   })
})
