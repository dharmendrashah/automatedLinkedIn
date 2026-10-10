import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { me } from './me'

const mocks = vi.hoisted(() => ({
   loadIdentity: vi.fn(),
   provisionUser: vi.fn(),
}))

vi.mock('../../identity', () => ({
   loadIdentity: mocks.loadIdentity,
   provisionUser: mocks.provisionUser,
}))

const auth = {
   token: 'tok',
   sub: 'sub-1',
}

const identity = {
   id: 'sub-1',
   name: 'Ada',
   username: 'ada',
   email: 'ada@elitale.com',
   emailVerified: false,
   groups: [],
}

const row = {
   id: 'u1',
   email: 'ada@elitale.com',
   name: 'Ada',
   role: 'USER',
   authentikId: 'sub-1',
   createdAt: new Date(),
   updatedAt: new Date(),
}

const projection = {
   id: 'u1',
   email: 'ada@elitale.com',
   name: 'Ada',
   role: 'USER',
}

const caller = (ctx: Partial<Context>) => router({ me }).createCaller(ctx as Context)

describe('me', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should reject an anonymous caller', async () => {
      await expect(
         caller({
            auth: null,
            user: null,
         }).me()
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

      expect(mocks.loadIdentity).not.toHaveBeenCalled()
   })

   it('should return the identity and the user without exposing internal fields', async () => {
      mocks.loadIdentity.mockResolvedValueOnce(identity)

      await expect(
         caller({
            auth,
            user: row as never,
         }).me()
      ).resolves.toEqual({
         identity,
         user: projection,
      })

      expect(mocks.loadIdentity).toHaveBeenCalledWith(auth)
      expect(mocks.provisionUser).not.toHaveBeenCalled()
   })

   it('should return the user created for a first-time caller', async () => {
      mocks.provisionUser.mockResolvedValueOnce(row)
      mocks.loadIdentity.mockResolvedValueOnce(identity)

      await expect(
         caller({
            auth,
            user: null,
         }).me()
      ).resolves.toEqual({
         identity,
         user: projection,
      })

      expect(mocks.provisionUser).toHaveBeenCalledWith(auth)
   })

   it('should return no user when none can be created', async () => {
      mocks.provisionUser.mockResolvedValueOnce(null)
      mocks.loadIdentity.mockResolvedValueOnce(identity)

      await expect(
         caller({
            auth,
            user: null,
         }).me()
      ).resolves.toEqual({
         identity,
         user: null,
      })
   })

   it('should surface identity provider errors', async () => {
      mocks.loadIdentity.mockRejectedValueOnce(
         new TRPCError({
            code: 'BAD_GATEWAY',
            message: 'down',
         })
      )

      await expect(
         caller({
            auth,
            user: row as never,
         }).me()
      ).rejects.toMatchObject({ code: 'BAD_GATEWAY' })
   })
})
