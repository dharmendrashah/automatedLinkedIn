import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadIdentity, provisionUser } from './identity'

const mocks = vi.hoisted(() => ({
   fetchIdentity: vi.fn(),
   provisionAuthentikAccount: vi.fn(),
   AccountConflictError: class AccountConflictError extends Error {},
}))

vi.mock('auth', () => ({ AuthService: { fetchIdentity: mocks.fetchIdentity } }))

vi.mock('database', () => ({
   AccountConflictError: mocks.AccountConflictError,
   UserService: { provisionAuthentikAccount: mocks.provisionAuthentikAccount },
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

describe('identity', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   describe('loadIdentity', () => {
      it('should return the identity from authentik', async () => {
         mocks.fetchIdentity.mockResolvedValueOnce(identity)

         await expect(loadIdentity(auth)).resolves.toBe(identity)

         expect(mocks.fetchIdentity).toHaveBeenCalledWith(auth)
      })

      it('should report a bad gateway when authentik cannot be reached', async () => {
         mocks.fetchIdentity.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))

         await expect(loadIdentity(auth)).rejects.toMatchObject({
            code: 'BAD_GATEWAY',
            message: 'Could not load the profile from the identity provider',
         })
      })
   })

   describe('provisionUser', () => {
      it('should provision the user from the identity', async () => {
         const user = { id: 'u1' }

         mocks.fetchIdentity.mockResolvedValueOnce(identity)
         mocks.provisionAuthentikAccount.mockResolvedValueOnce(user)

         await expect(provisionUser(auth)).resolves.toBe(user)

         expect(mocks.provisionAuthentikAccount).toHaveBeenCalledWith({
            id: 'sub-1',
            name: 'Ada',
            email: 'ada@elitale.com',
            emailVerified: false,
         })
      })

      it('should return no user when the account cannot get one', async () => {
         mocks.fetchIdentity.mockResolvedValueOnce(identity)
         mocks.provisionAuthentikAccount.mockResolvedValueOnce(null)

         await expect(provisionUser(auth)).resolves.toBeNull()
      })

      it('should report a bad gateway when authentik cannot be reached', async () => {
         mocks.fetchIdentity.mockRejectedValueOnce(new Error('down'))

         await expect(provisionUser(auth)).rejects.toMatchObject({ code: 'BAD_GATEWAY' })

         expect(mocks.provisionAuthentikAccount).not.toHaveBeenCalled()
      })

      it('should turn an email conflict into a CONFLICT error', async () => {
         mocks.fetchIdentity.mockResolvedValueOnce(identity)
         mocks.provisionAuthentikAccount.mockRejectedValueOnce(new mocks.AccountConflictError('taken'))

         await expect(provisionUser(auth)).rejects.toMatchObject({
            code: 'CONFLICT',
            message: 'taken',
         })
      })

      it('should rethrow unexpected errors', async () => {
         const failure = new Error('db down')

         mocks.fetchIdentity.mockResolvedValueOnce(identity)
         mocks.provisionAuthentikAccount.mockRejectedValueOnce(failure)

         await expect(provisionUser(auth)).rejects.toBe(failure)
      })
   })
})
