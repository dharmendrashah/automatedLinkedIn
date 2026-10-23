import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
   LinkedInAccountConflictError,
   LinkedInAccountService,
   LinkedInCredentialsError,
} from './linkedInAccount.service'

const mocks = vi.hoisted(() => ({
   create: vi.fn(),
   findMany: vi.fn(),
   findSessions: vi.fn(),
   findFirst: vi.fn(),
   update: vi.fn(),
   deleteMany: vi.fn(),
   seal: vi.fn(),
   open: vi.fn(),
   removeFiles: vi.fn(),
}))

vi.mock('core', () => ({
   CryptoService: {
      seal: mocks.seal,
      open: mocks.open,
   },
   KeptFiles: { removeAccount: mocks.removeFiles },
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInAccount: {
            create: mocks.create,
            findMany: mocks.findMany,
            findFirst: mocks.findFirst,
            update: mocks.update,
            deleteMany: mocks.deleteMany,
         },
         spiderSession: { findMany: mocks.findSessions },
      },
   },
}))

const sealed = {
   ciphertext: 'ct',
   iv: 'iv',
   tag: 'tag',
}

const storedRow = {
   id: 'a1',
   userId: 'u1',
   email: 'ada@work.com',
   secret: 'ct',
   secretIv: 'iv',
   secretTag: 'tag',
   keyVersion: 1,
   hasPassword: true,
   hasTotp: false,
   hasSession: false,
   status: 'PENDING',
   statusMessage: null,
   statusUpdatedAt: new Date(),
   lastVerifiedAt: null,
   createdAt: new Date(),
   updatedAt: new Date(),
}

describe('LinkedInAccountService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.seal.mockReturnValue(sealed)
   })

   describe('create', () => {
      it('should encrypt the secrets and store ciphertext with presence flags', async () => {
         mocks.create.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.create('u1', 'ada@work.com', {
            password: 'pw',
            totpSecret: 'otp',
         })

         expect(mocks.seal).toHaveBeenCalledWith(
            JSON.stringify({
               password: 'pw',
               totpSecret: 'otp',
            })
         )

         const [[{ data, select }]] = mocks.create.mock.calls

         expect(data).toMatchObject({
            userId: 'u1',
            email: 'ada@work.com',
            secret: 'ct',
            secretIv: 'iv',
            secretTag: 'tag',
            hasPassword: true,
            hasTotp: true,
            hasSession: false,
         })
         // The plaintext never reaches the row as its own column.
         expect(JSON.stringify(data)).not.toContain('"pw"')
         expect(JSON.stringify(data)).not.toContain('password":"pw')
         expect(select).not.toHaveProperty('secret', true)
      })

      it('should map a unique violation to a conflict error', async () => {
         mocks.create.mockRejectedValueOnce({ code: 'P2002' })

         await expect(LinkedInAccountService.create('u1', 'ada@work.com', { password: 'pw' })).rejects.toBeInstanceOf(
            LinkedInAccountConflictError
         )
      })

      it('should rethrow other errors', async () => {
         mocks.create.mockRejectedValueOnce(new Error('boom'))

         await expect(LinkedInAccountService.create('u1', 'ada@work.com', { password: 'pw' })).rejects.toThrow('boom')
      })

      it.each([
         ['password only', { password: 'pw' }],
         [
            'password and totp',
            {
               password: 'pw',
               totpSecret: 'otp',
            },
         ],
         ['cookie only', { session: 'li_at=abc' }],
         [
            'password and cookie',
            {
               password: 'pw',
               session: 'li_at=abc',
            },
         ],
         [
            'everything',
            {
               password: 'pw',
               totpSecret: 'otp',
               session: 'li_at=abc',
            },
         ],
      ])('should accept %s', async (_name, secrets) => {
         mocks.create.mockResolvedValueOnce({ id: 'a1' })

         await expect(LinkedInAccountService.create('u1', 'ada@work.com', secrets)).resolves.toEqual({ id: 'a1' })
      })

      it('should reject when there is neither a password nor a cookie', async () => {
         await expect(LinkedInAccountService.create('u1', 'ada@work.com', {})).rejects.toBeInstanceOf(
            LinkedInCredentialsError
         )
         expect(mocks.create).not.toHaveBeenCalled()
      })

      it('should reject a two-step key without a password', async () => {
         await expect(LinkedInAccountService.create('u1', 'ada@work.com', { totpSecret: 'otp' })).rejects.toThrow(
            'password'
         )
         await expect(
            LinkedInAccountService.create('u1', 'ada@work.com', {
               totpSecret: 'otp',
               session: 'li_at=abc',
            })
         ).rejects.toBeInstanceOf(LinkedInCredentialsError)
         expect(mocks.create).not.toHaveBeenCalled()
      })
   })

   describe('listForUser', () => {
      beforeEach(() => {
         mocks.findSessions.mockResolvedValue([])
      })

      it('should scope to the user and never select secret columns', () => {
         mocks.findMany.mockResolvedValueOnce([])

         void LinkedInAccountService.listForUser('u1')

         const [[{ where, select }]] = mocks.findMany.mock.calls

         expect(where).toEqual({ userId: 'u1' })
         expect(select).not.toHaveProperty('secret')
         expect(select).not.toHaveProperty('secretIv')
      })

      it('should select the status columns', () => {
         mocks.findMany.mockResolvedValueOnce([])

         void LinkedInAccountService.listForUser('u1')

         const [[{ select }]] = mocks.findMany.mock.calls

         expect(select).toMatchObject({
            status: true,
            statusMessage: true,
            statusUpdatedAt: true,
            lastVerifiedAt: true,
            nextBrowseAt: true,
         })
      })

      it('should give each account its newest visit, or none', async () => {
         const visit = {
            id: 's2',
            linkedInAccountId: 'a1',
            status: 'SUCCEEDED',
            verdict: 'DONE',
            message: 'Looked around LinkedIn as the account.',
            trigger: 'manual',
            startedAt: new Date('2026-10-19T09:00:00Z'),
            finishedAt: new Date('2026-10-19T09:04:00Z'),
         }

         mocks.findMany.mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }])
         mocks.findSessions.mockResolvedValueOnce([visit])

         const accounts = await LinkedInAccountService.listForUser('u1')

         expect(mocks.findSessions).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  userId: 'u1',
                  task: 'linkedin-browse',
                  linkedInAccountId: { in: ['a1', 'a2'] },
               },
               distinct: ['linkedInAccountId'],
               orderBy: { startedAt: 'desc' },
            })
         )
         expect(accounts[0].lastVisit).toEqual({
            id: 's2',
            status: 'SUCCEEDED',
            verdict: 'DONE',
            message: 'Looked around LinkedIn as the account.',
            trigger: 'manual',
            startedAt: visit.startedAt,
            finishedAt: visit.finishedAt,
         })
         expect(accounts[1].lastVisit).toBeNull()
      })
   })

   describe('getForUser', () => {
      it('should scope by id and user', () => {
         mocks.findFirst.mockResolvedValueOnce(null)

         void LinkedInAccountService.getForUser('u1', 'a1')

         expect(mocks.findFirst.mock.calls[0][0].where).toEqual({
            id: 'a1',
            userId: 'u1',
         })
      })
   })

   describe('revealForUser', () => {
      it('should return null when the account is not the users', async () => {
         mocks.findFirst.mockResolvedValueOnce(null)

         await expect(LinkedInAccountService.revealForUser('u1', 'a1')).resolves.toBeNull()
         expect(mocks.open).not.toHaveBeenCalled()
      })

      it('should decrypt and return the secrets for an owned account', async () => {
         mocks.findFirst.mockResolvedValueOnce(storedRow)
         mocks.open.mockReturnValueOnce(JSON.stringify({ password: 'pw' }))

         await expect(LinkedInAccountService.revealForUser('u1', 'a1')).resolves.toEqual({
            email: 'ada@work.com',
            secrets: { password: 'pw' },
         })
         expect(mocks.open).toHaveBeenCalledWith({
            ciphertext: 'ct',
            iv: 'iv',
            tag: 'tag',
         })
      })
   })

   describe('updateForUser', () => {
      it('should return null when the account is not the users', async () => {
         mocks.findFirst.mockResolvedValueOnce(null)

         await expect(LinkedInAccountService.updateForUser('u1', 'a1', { email: 'x@y.com' })).resolves.toBeNull()
         expect(mocks.update).not.toHaveBeenCalled()
      })

      it('should merge a patch onto the existing secrets, clearing on null', async () => {
         mocks.findFirst.mockResolvedValueOnce(storedRow)
         mocks.open.mockReturnValueOnce(
            JSON.stringify({
               password: 'old',
               totpSecret: 'otp',
            })
         )
         mocks.update.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.updateForUser('u1', 'a1', {
            secrets: {
               password: 'new',
               totpSecret: null,
            },
         })

         expect(mocks.seal).toHaveBeenCalledWith(JSON.stringify({ password: 'new' }))
      })

      it('should leave secrets unchanged when the patch omits them', async () => {
         mocks.findFirst.mockResolvedValueOnce(storedRow)
         mocks.open.mockReturnValueOnce(JSON.stringify({ password: 'keep' }))
         mocks.update.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.updateForUser('u1', 'a1', {
            email: 'new@work.com',
            secrets: {},
         })

         expect(mocks.seal).toHaveBeenCalledWith(JSON.stringify({ password: 'keep' }))
         expect(mocks.update.mock.calls[0][0].data.email).toBe('new@work.com')
      })

      it('should map a unique violation to a conflict error', async () => {
         mocks.findFirst.mockResolvedValueOnce(storedRow)
         mocks.open.mockReturnValueOnce(JSON.stringify({ password: 'pw' }))
         mocks.update.mockRejectedValueOnce({ code: 'P2002' })

         await expect(
            LinkedInAccountService.updateForUser('u1', 'a1', { email: 'dupe@work.com' })
         ).rejects.toBeInstanceOf(LinkedInAccountConflictError)
      })

      it('should reset a verified account to PENDING when its secrets change', async () => {
         mocks.findFirst.mockResolvedValueOnce({
            ...storedRow,
            status: 'ACTIVE',
            statusMessage: 'ok',
         })
         mocks.open.mockReturnValueOnce(JSON.stringify({ password: 'old' }))
         mocks.update.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.updateForUser('u1', 'a1', { secrets: { password: 'new' } })

         expect(mocks.update.mock.calls[0][0].data).toMatchObject({
            status: 'PENDING',
            statusMessage: null,
         })
      })

      it('should keep a disabled account disabled when its secrets change', async () => {
         mocks.findFirst.mockResolvedValueOnce({
            ...storedRow,
            status: 'DISABLED',
         })
         mocks.open.mockReturnValueOnce(JSON.stringify({ password: 'old' }))
         mocks.update.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.updateForUser('u1', 'a1', { secrets: { password: 'new' } })

         expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty('status')
      })

      it('should reject an update that would leave no password and no cookie', async () => {
         mocks.findFirst.mockResolvedValueOnce(storedRow)
         mocks.open.mockReturnValueOnce(JSON.stringify({ password: 'pw' }))

         await expect(
            LinkedInAccountService.updateForUser('u1', 'a1', { secrets: { password: null } })
         ).rejects.toBeInstanceOf(LinkedInCredentialsError)
         expect(mocks.update).not.toHaveBeenCalled()
      })

      it('should reject clearing the password while a two-step key remains', async () => {
         mocks.findFirst.mockResolvedValueOnce(storedRow)
         mocks.open.mockReturnValueOnce(
            JSON.stringify({
               password: 'pw',
               totpSecret: 'otp',
               session: 'li_at=abc',
            })
         )

         await expect(
            LinkedInAccountService.updateForUser('u1', 'a1', { secrets: { password: null } })
         ).rejects.toThrow('password')
         expect(mocks.update).not.toHaveBeenCalled()
      })

      it('should allow switching from a password to a cookie', async () => {
         mocks.findFirst.mockResolvedValueOnce(storedRow)
         mocks.open.mockReturnValueOnce(JSON.stringify({ password: 'pw' }))
         mocks.update.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.updateForUser('u1', 'a1', {
            secrets: {
               password: null,
               session: 'li_at=abc',
            },
         })

         expect(mocks.seal).toHaveBeenCalledWith(JSON.stringify({ session: 'li_at=abc' }))
      })

      it('should reset a verified account to PENDING when its email changes, since it is another login', async () => {
         mocks.findFirst.mockResolvedValueOnce({
            ...storedRow,
            status: 'ACTIVE',
            statusMessage: 'ok',
         })
         mocks.open.mockReturnValueOnce(JSON.stringify({ password: 'pw' }))
         mocks.update.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.updateForUser('u1', 'a1', { email: 'new@work.com' })

         expect(mocks.update.mock.calls[0][0].data).toMatchObject({
            status: 'PENDING',
            statusMessage: null,
            lastVerifiedAt: null,
         })
      })

      it('should not touch the status when the email is sent but has not changed', async () => {
         mocks.findFirst.mockResolvedValueOnce({
            ...storedRow,
            status: 'ACTIVE',
         })
         mocks.open.mockReturnValueOnce(JSON.stringify({ password: 'pw' }))
         mocks.update.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.updateForUser('u1', 'a1', { email: storedRow.email })

         expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty('status')
      })

      it('should keep a disabled account disabled when its email changes', async () => {
         mocks.findFirst.mockResolvedValueOnce({
            ...storedRow,
            status: 'DISABLED',
         })
         mocks.open.mockReturnValueOnce(JSON.stringify({ password: 'pw' }))
         mocks.update.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.updateForUser('u1', 'a1', { email: 'new@work.com' })

         expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty('status')
      })
   })

   describe('setPausedForUser', () => {
      it('should return null when the account is not the users', async () => {
         mocks.findFirst.mockResolvedValueOnce(null)

         await expect(LinkedInAccountService.setPausedForUser('u1', 'a1', true)).resolves.toBeNull()
         expect(mocks.update).not.toHaveBeenCalled()
      })

      it('should scope the lookup by id and user', async () => {
         mocks.findFirst.mockResolvedValueOnce(null)

         await LinkedInAccountService.setPausedForUser('u1', 'a1', true)

         expect(mocks.findFirst.mock.calls[0][0].where).toEqual({
            id: 'a1',
            userId: 'u1',
         })
      })

      it('should disable an account when paused', async () => {
         mocks.findFirst.mockResolvedValueOnce(storedRow)
         mocks.update.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.setPausedForUser('u1', 'a1', true)

         expect(mocks.update.mock.calls[0][0].data).toMatchObject({
            status: 'DISABLED',
            statusMessage: 'Paused by you',
         })
      })

      it('should move a disabled account back to PENDING when resumed', async () => {
         mocks.findFirst.mockResolvedValueOnce({
            ...storedRow,
            status: 'DISABLED',
         })
         mocks.update.mockResolvedValueOnce({ id: 'a1' })

         await LinkedInAccountService.setPausedForUser('u1', 'a1', false)

         expect(mocks.update.mock.calls[0][0].data).toMatchObject({
            status: 'PENDING',
            statusMessage: null,
         })
      })

      it('should leave a non-disabled account alone when resumed', async () => {
         mocks.findFirst.mockResolvedValueOnce({
            ...storedRow,
            status: 'ACTIVE',
         })

         await LinkedInAccountService.setPausedForUser('u1', 'a1', false)

         expect(mocks.update).not.toHaveBeenCalled()
      })
   })

   describe('deleteForUser', () => {
      it('should report whether a row was deleted and scope by id and user', async () => {
         mocks.deleteMany.mockResolvedValueOnce({ count: 1 })

         await expect(LinkedInAccountService.deleteForUser('u1', 'a1')).resolves.toBe(true)
         expect(mocks.deleteMany.mock.calls[0][0].where).toEqual({
            id: 'a1',
            userId: 'u1',
         })
      })

      it('should return false when nothing matched', async () => {
         mocks.deleteMany.mockResolvedValueOnce({ count: 0 })

         await expect(LinkedInAccountService.deleteForUser('u1', 'a1')).resolves.toBe(false)
      })

      it('should delete the kept files of the account first, and keep the account when they cannot be deleted', async () => {
         mocks.removeFiles.mockResolvedValueOnce(undefined)
         mocks.deleteMany.mockResolvedValueOnce({ count: 1 })

         await LinkedInAccountService.deleteForUser('u1', 'a1')

         expect(mocks.removeFiles).toHaveBeenCalledWith('u1', 'a1')
         expect(mocks.removeFiles.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.deleteMany.mock.invocationCallOrder[0] ?? 0
         )

         mocks.deleteMany.mockClear()
         mocks.removeFiles.mockRejectedValueOnce(new Error('bucket down'))

         await expect(LinkedInAccountService.deleteForUser('u1', 'a1')).rejects.toThrow('bucket down')
         expect(mocks.deleteMany).not.toHaveBeenCalled()
      })
   })
})
