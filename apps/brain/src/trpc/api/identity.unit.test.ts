import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadIdentity, provisionUser } from './identity'

const mocks = vi.hoisted(() => ({
   fetchIdentity: vi.fn(),
   provisionAuthentikAccount: vi.fn(),
   syncAdmin: vi.fn(),
   findById: vi.fn(),
   AccountConflictError: class AccountConflictError extends Error {},
}))

vi.mock('auth', () => ({ AuthService: { fetchIdentity: mocks.fetchIdentity } }))

vi.mock('env', () => ({ ADMIN_EMAIL: 'owner@elitale.com' }))

vi.mock('database', () => ({
   AccountConflictError: mocks.AccountConflictError,
   UserService: {
      provisionAuthentikAccount: mocks.provisionAuthentikAccount,
      syncAdmin: mocks.syncAdmin,
      findById: mocks.findById,
      isAdminEmail: (email: string, adminEmail: string) =>
         adminEmail !== '' && email.toLowerCase() === adminEmail.toLowerCase(),
   },
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

      it('should make the platform owner ADMIN when their email is verified, ignoring case', async () => {
         const promoted = {
            id: 'u1',
            role: 'ADMIN',
         }

         mocks.fetchIdentity.mockResolvedValueOnce({
            ...identity,
            email: 'Owner@Elitale.com',
            emailVerified: true,
         })
         mocks.provisionAuthentikAccount.mockResolvedValueOnce({
            id: 'u1',
            email: 'Owner@Elitale.com',
            role: 'USER',
         })
         mocks.findById.mockResolvedValueOnce(promoted)

         await expect(provisionUser(auth)).resolves.toBe(promoted)

         expect(mocks.syncAdmin).toHaveBeenCalledWith('owner@elitale.com')
      })

      it('should not promote the owner address when authentik did not verify it', async () => {
         const user = {
            id: 'u1',
            email: 'owner@elitale.com',
            role: 'USER',
         }

         mocks.fetchIdentity.mockResolvedValueOnce({
            ...identity,
            email: 'owner@elitale.com',
            emailVerified: false,
         })
         mocks.provisionAuthentikAccount.mockResolvedValueOnce(user)

         await expect(provisionUser(auth)).resolves.toBe(user)

         expect(mocks.syncAdmin).not.toHaveBeenCalled()
      })

      it('should not promote any other user', async () => {
         mocks.fetchIdentity.mockResolvedValueOnce({
            ...identity,
            emailVerified: true,
         })
         mocks.provisionAuthentikAccount.mockResolvedValueOnce({
            id: 'u2',
            email: 'ada@elitale.com',
         })

         await provisionUser(auth)

         expect(mocks.syncAdmin).not.toHaveBeenCalled()
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
