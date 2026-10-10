import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createContext } from './context'

const mocks = vi.hoisted(() => ({
   authenticate: vi.fn(),
   findByAuthentikId: vi.fn(),
}))

vi.mock('auth', () => ({
   AuthService: {
      bearerToken: (header?: string) => header?.replace(/^Bearer /, ''),
      authenticate: mocks.authenticate,
   },
}))

vi.mock('database', () => ({ UserService: { findByAuthentikId: mocks.findByAuthentikId } }))

const options = (authorization?: string) =>
   ({
      req: { headers: { authorization } },
      res: {},
   }) as never

describe('createContext', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should leave the context anonymous without a token', async () => {
      const ctx = await createContext(options())

      expect(ctx).toMatchObject({
         auth: null,
         user: null,
      })
      expect(mocks.authenticate).not.toHaveBeenCalled()
      expect(mocks.findByAuthentikId).not.toHaveBeenCalled()
   })

   it('should stay anonymous when the token is invalid', async () => {
      mocks.authenticate.mockResolvedValueOnce(null)

      const ctx = await createContext(options('Bearer bad'))

      expect(ctx).toMatchObject({
         auth: null,
         user: null,
      })
      expect(mocks.findByAuthentikId).not.toHaveBeenCalled()
   })

   it('should attach the authenticated request and its linked user', async () => {
      const auth = {
         token: 'good',
         sub: 'sub-1',
      }
      const user = {
         id: '1',
         role: 'USER',
      }

      mocks.authenticate.mockResolvedValueOnce(auth)
      mocks.findByAuthentikId.mockResolvedValueOnce(user)

      const ctx = await createContext(options('Bearer good'))

      expect(ctx).toMatchObject({
         auth,
         user,
      })
      expect(mocks.authenticate).toHaveBeenCalledWith('good')
      expect(mocks.findByAuthentikId).toHaveBeenCalledWith('sub-1')
   })

   it('should have no user when the account is not linked', async () => {
      mocks.authenticate.mockResolvedValueOnce({
         token: 'good',
         sub: 'sub-1',
      })
      mocks.findByAuthentikId.mockResolvedValueOnce(null)

      await expect(createContext(options('Bearer good'))).resolves.toMatchObject({ user: null })
   })
})
