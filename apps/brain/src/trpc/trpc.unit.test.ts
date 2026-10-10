import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type Context } from './api/context'
import { router, userProcedure } from './trpc'

const mocks = vi.hoisted(() => ({ provisionUser: vi.fn() }))

vi.mock('./api/identity', () => ({ provisionUser: mocks.provisionUser }))

const auth = {
   token: 'tok',
   sub: 'sub-1',
}

const whoAmI = userProcedure.query(({ ctx }) => ctx.user)

const caller = (ctx: Partial<Context>) => router({ whoAmI }).createCaller(ctx as Context)

describe('userProcedure', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should reject an anonymous caller without provisioning anyone', async () => {
      await expect(
         caller({
            auth: null,
            user: null,
         }).whoAmI()
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

      expect(mocks.provisionUser).not.toHaveBeenCalled()
   })

   it('should use the user the context already found', async () => {
      const user = { id: 'u1' }

      await expect(
         caller({
            auth,
            user: user as never,
         }).whoAmI()
      ).resolves.toBe(user)

      expect(mocks.provisionUser).not.toHaveBeenCalled()
   })

   it('should provision a user for a caller who has none', async () => {
      const user = { id: 'u2' }

      mocks.provisionUser.mockResolvedValueOnce(user)

      await expect(
         caller({
            auth,
            user: null,
         }).whoAmI()
      ).resolves.toBe(user)

      expect(mocks.provisionUser).toHaveBeenCalledWith(auth)
   })

   it('should let the caller through without a user when none can be created', async () => {
      mocks.provisionUser.mockResolvedValueOnce(null)

      await expect(
         caller({
            auth,
            user: null,
         }).whoAmI()
      ).resolves.toBeNull()
   })

   it('should fail the request when provisioning fails', async () => {
      mocks.provisionUser.mockRejectedValueOnce(new Error('boom'))

      await expect(
         caller({
            auth,
            user: null,
         }).whoAmI()
      ).rejects.toThrow('boom')
   })
})
