import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createContext } from './context'

const mocks = vi.hoisted(() => ({
   authenticate: vi.fn(),
   findByAuthentikId: vi.fn(),
   findById: vi.fn(),
   keyAuthenticate: vi.fn(),
}))

vi.mock('auth', () => ({
   AuthService: {
      bearerToken: (header?: string) => header?.replace(/^Bearer /, ''),
      authenticate: mocks.authenticate,
   },
}))

vi.mock('database', () => ({
   UserService: {
      findByAuthentikId: mocks.findByAuthentikId,
      findById: mocks.findById,
   },
   API_KEY_PREFIX: 'alk_',
   ApiKeyService: { authenticate: mocks.keyAuthenticate },
}))

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

   it('should authenticate a valid API key without calling authentik at all', async () => {
      const user = {
         id: 'u1',
         role: 'USER',
      }

      mocks.keyAuthenticate.mockResolvedValueOnce('u1')
      mocks.findById.mockResolvedValueOnce(user)

      const ctx = await createContext(options('Bearer alk_abc123'))

      expect(ctx).toMatchObject({
         auth: null,
         user,
      })
      expect(mocks.keyAuthenticate).toHaveBeenCalledWith('alk_abc123')
      expect(mocks.authenticate).not.toHaveBeenCalled()
   })

   it('should stay anonymous for an unknown, revoked or expired API key', async () => {
      mocks.keyAuthenticate.mockResolvedValueOnce(null)

      const ctx = await createContext(options('Bearer alk_bad'))

      expect(ctx).toMatchObject({
         auth: null,
         user: null,
      })
      expect(mocks.findById).not.toHaveBeenCalled()
   })
})
