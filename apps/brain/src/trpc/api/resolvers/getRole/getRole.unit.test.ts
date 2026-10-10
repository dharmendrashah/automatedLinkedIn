import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { getRole } from './getRole'

const mocks = vi.hoisted(() => ({ provisionUser: vi.fn() }))

vi.mock('../../identity', () => ({ provisionUser: mocks.provisionUser }))

const caller = (ctx: Partial<Context>) => router({ getRole }).createCaller(ctx as Context)

const auth = {
   token: 'tok',
   sub: 'sub-1',
}

describe('getRole', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should reject an anonymous caller', async () => {
      await expect(
         caller({
            auth: null,
            user: null,
         }).getRole()
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
   })

   it('should return the role of the user', async () => {
      await expect(
         caller({
            auth,
            user: { role: 'ADMIN' } as never,
         }).getRole()
      ).resolves.toEqual({ role: 'ADMIN' })
   })

   it('should return the role of the user created for a first-time caller', async () => {
      mocks.provisionUser.mockResolvedValueOnce({ role: 'USER' })

      await expect(
         caller({
            auth,
            user: null,
         }).getRole()
      ).resolves.toEqual({ role: 'USER' })
   })

   it('should default to USER when no user can be created', async () => {
      mocks.provisionUser.mockResolvedValueOnce(null)

      await expect(
         caller({
            auth,
            user: null,
         }).getRole()
      ).resolves.toEqual({ role: 'USER' })
   })
})
