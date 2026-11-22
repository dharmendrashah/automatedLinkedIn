import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { apiKey } from './apiKey'

const mocks = vi.hoisted(() => {
   class ConflictError extends Error {}

   return {
      ConflictError,
      list: vi.fn(),
      create: vi.fn(),
      revoke: vi.fn(),
   }
})

vi.mock('database', () => ({
   ConflictError: mocks.ConflictError,
   ApiKeyService: {
      list: mocks.list,
      create: mocks.create,
      revoke: mocks.revoke,
   },
}))

vi.mock('env', () => ({
   AUTHENTIK_ISSUER: 'http://localhost:9000/application/o/automatedlinkedin/',
   AUTHENTIK_CLIENT_ID: 'automatedlinkedin',
   AUTHENTIK_INTERNAL_URL: '',
   DATABASE_URL: 'postgresql://localhost:5432/test',
   CORS_ORIGINS: 'http://localhost:3000',
   GIT_SHA: 'test',
   BUILD_TIME: 'test',
   PORT: 3001,
}))

const ctx = {
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: { id: 'u1' },
} as unknown as Context

const caller = () => router({ apiKey }).createCaller(ctx).apiKey

describe('apiKey resolver', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('lists the owner\u2019s keys', async () => {
      const keys = [
         {
            id: 'k1',
            name: 'ci',
         },
      ]
      mocks.list.mockResolvedValueOnce(keys)

      await expect(caller().list()).resolves.toBe(keys)
      expect(mocks.list).toHaveBeenCalledWith('u1')
   })

   it('creates a key with the given name and expiry', async () => {
      const created = {
         key: 'alk_abc',
         row: { id: 'k1' },
      }
      mocks.create.mockResolvedValueOnce(created)

      await expect(
         caller().create({
            name: 'ci',
            expiresInDays: 30,
         })
      ).resolves.toBe(created)

      expect(mocks.create).toHaveBeenCalledWith('u1', 'ci', 30)
   })

   it('turns a duplicate name into a CONFLICT error', async () => {
      mocks.create.mockRejectedValueOnce(new mocks.ConflictError('A key with this name already exists.'))

      await expect(
         caller().create({
            name: 'dup',
            expiresInDays: null,
         })
      ).rejects.toMatchObject({ code: 'CONFLICT' })
   })

   it('revokes a key owned by the caller', async () => {
      mocks.revoke.mockResolvedValueOnce(true)

      await expect(caller().revoke({ id: 'k1' })).resolves.toBeUndefined()
      expect(mocks.revoke).toHaveBeenCalledWith('u1', 'k1')
   })

   it('answers NOT_FOUND for a key that is not the caller\u2019s or is already revoked', async () => {
      mocks.revoke.mockResolvedValueOnce(false)

      await expect(caller().revoke({ id: 'k1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })
})
