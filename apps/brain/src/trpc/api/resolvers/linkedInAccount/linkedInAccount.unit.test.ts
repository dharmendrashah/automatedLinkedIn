import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { linkedInAccount } from './linkedInAccount'

const mocks = vi.hoisted(() => {
   class LinkedInAccountConflictError extends Error {}
   class LinkedInCredentialsError extends Error {}
   class LinkedInAccountPausedError extends Error {}
   class LinkedInVerifyCooldownError extends Error {}

   return {
      LinkedInAccountConflictError,
      LinkedInCredentialsError,
      LinkedInAccountPausedError,
      LinkedInVerifyCooldownError,
      create: vi.fn(),
      listForUser: vi.fn(),
      getForUser: vi.fn(),
      revealForUser: vi.fn(),
      updateForUser: vi.fn(),
      setPausedForUser: vi.fn(),
      deleteForUser: vi.fn(),
      request: vi.fn(),
      verifyForUser: vi.fn(),
   }
})

vi.mock('database', () => ({
   LinkedInAccountConflictError: mocks.LinkedInAccountConflictError,
   LinkedInCredentialsError: mocks.LinkedInCredentialsError,
   LinkedInAccountPausedError: mocks.LinkedInAccountPausedError,
   LinkedInVerifyCooldownError: mocks.LinkedInVerifyCooldownError,
   LinkedInAccountService: {
      create: mocks.create,
      listForUser: mocks.listForUser,
      getForUser: mocks.getForUser,
      revealForUser: mocks.revealForUser,
      updateForUser: mocks.updateForUser,
      setPausedForUser: mocks.setPausedForUser,
      deleteForUser: mocks.deleteForUser,
   },
   LinkedInAccountValidationService: {
      request: mocks.request,
      verifyForUser: mocks.verifyForUser,
   },
}))

vi.mock('env', () => ({
   AUTHENTIK_ISSUER: 'http://localhost:9000/application/o/automatedlinkedin/',
   AUTHENTIK_CLIENT_ID: 'automatedlinkedin',
   AUTHENTIK_INTERNAL_URL: '',
   DATABASE_URL: 'postgresql://localhost:5432/test',
   CORS_ORIGINS: 'http://localhost:3000',
   LINKEDIN_CRED_ENC_KEY: 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ=',
   GIT_SHA: 'test',
   BUILD_TIME: 'test',
   PORT: 3001,
}))

const liAt = 'AQEDARz1x2aBcD3eFgHiJkLmNoPqRsTuVwXyZ0123456789-_abcdefghijklmnopqrstuvwxyz'

const user = {
   id: 'u1',
   email: 'ada@elitale.com',
   name: 'Ada',
   role: 'USER',
   authentikId: 'sub-1',
   createdAt: new Date(),
   updatedAt: new Date(),
}

const authed = (): Partial<Context> => ({
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: user as never,
})

const caller = (ctx: Partial<Context>) => router({ linkedInAccount }).createCaller(ctx as Context).linkedInAccount

describe('linkedInAccount resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.request.mockResolvedValue(true)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
   })

   it('should reject an anonymous caller', async () => {
      await expect(
         caller({
            auth: null,
            user: null,
         }).list()
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
   })

   describe('create', () => {
      it('should store for the current user and return metadata', async () => {
         const metadata = {
            id: 'a1',
            email: 'ada@work.com',
            hasPassword: true,
            hasTotp: false,
            hasSession: false,
         }
         mocks.create.mockResolvedValueOnce(metadata)

         await expect(
            caller(authed()).create({
               email: 'ada@work.com',
               password: 'pw',
            })
         ).resolves.toEqual(metadata)
         expect(mocks.create).toHaveBeenCalledWith('u1', 'ada@work.com', {
            password: 'pw',
            totpSecret: undefined,
            session: undefined,
         })
      })

      it('should map the service credential rule to BAD_REQUEST with its message', async () => {
         mocks.create.mockRejectedValueOnce(new mocks.LinkedInCredentialsError('Add a password or a token'))

         await expect(caller(authed()).create({ email: 'ada@work.com' })).rejects.toMatchObject({
            code: 'BAD_REQUEST',
            message: 'Add a password or a token',
         })
      })

      it('should store the whole pasted cookie dump once it contains li_at', async () => {
         mocks.create.mockResolvedValueOnce({ id: 'a1' })
         const dump = `  JSESSIONID="ajax:1"; li_at=${liAt}; lang=v=2\n`

         await caller(authed()).create({
            email: 'ada@work.com',
            session: dump,
         })

         expect(mocks.create.mock.calls[0][2].session).toBe(dump.trim())
      })

      it('should reject a cookie paste without li_at and not echo it', async () => {
         const attempt = caller(authed()).create({
            email: 'ada@work.com',
            session: 'JSESSIONID="ajax:SecretJsession"; lang=v=2',
         })

         await expect(attempt).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         await expect(attempt).rejects.toThrow(/li_at/)
         await expect(attempt).rejects.not.toThrow(/SecretJsession/)
         expect(mocks.create).not.toHaveBeenCalled()
      })

      it('should accept a large cookie dump', async () => {
         mocks.create.mockResolvedValueOnce({ id: 'a1' })
         const dump = `${'junk=1; '.repeat(4000)}li_at=${liAt}`

         await caller(authed()).create({
            email: 'ada@work.com',
            session: dump,
         })

         expect(mocks.create.mock.calls[0][2].session).toBe(dump)
      })

      it('should store the base32 secret when given an otpauth URI', async () => {
         mocks.create.mockResolvedValueOnce({ id: 'a1' })

         await caller(authed()).create({
            email: 'ada@work.com',
            totpSecret: 'otpauth://totp/LinkedIn:ada@work.com?secret=SWXCKS6W42KV2LUMETNO5MXUCJIEOWDX&issuer=LinkedIn',
         })

         expect(mocks.create).toHaveBeenCalledWith('u1', 'ada@work.com', {
            password: undefined,
            totpSecret: 'SWXCKS6W42KV2LUMETNO5MXUCJIEOWDX',
            session: undefined,
         })
      })

      it('should normalize a pasted base32 secret', async () => {
         mocks.create.mockResolvedValueOnce({ id: 'a1' })

         await caller(authed()).create({
            email: 'ada@work.com',
            totpSecret: 'swxc ks6w 42kv 2lum etno 5mxu cjie owdx',
         })

         expect(mocks.create.mock.calls[0][2].totpSecret).toBe('SWXCKS6W42KV2LUMETNO5MXUCJIEOWDX')
      })

      it('should reject an invalid TOTP secret without echoing it', async () => {
         const attempt = caller(authed()).create({
            email: 'ada@work.com',
            totpSecret: 'not-valid-secret!',
         })

         await expect(attempt).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         await expect(attempt).rejects.toThrow(/base32/)
         await expect(attempt).rejects.not.toThrow(/not-valid-secret/)
         expect(mocks.create).not.toHaveBeenCalled()
      })

      it('should map a conflict to CONFLICT', async () => {
         mocks.create.mockRejectedValueOnce(new mocks.LinkedInAccountConflictError('dupe'))

         await expect(
            caller(authed()).create({
               email: 'ada@work.com',
               password: 'pw',
            })
         ).rejects.toMatchObject({ code: 'CONFLICT' })
         expect(mocks.request).not.toHaveBeenCalled()
      })

      it('should ask the worker to validate the new account', async () => {
         mocks.create.mockResolvedValueOnce({
            id: 'a1',
            status: 'PENDING',
         })

         await caller(authed()).create({
            email: 'ada@work.com',
            password: 'pw',
         })

         expect(mocks.request).toHaveBeenCalledWith('a1')
      })

      it('should still store the account when the validation cannot be queued', async () => {
         mocks.create.mockResolvedValueOnce({
            id: 'a1',
            status: 'PENDING',
         })
         mocks.request.mockRejectedValue(new Error('database down'))

         await expect(
            caller(authed()).create({
               email: 'ada@work.com',
               password: 'pw',
            })
         ).resolves.toMatchObject({ id: 'a1' })
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('database down'))
      })
   })

   describe('list and get', () => {
      it('should list for the current user', async () => {
         mocks.listForUser.mockResolvedValueOnce([])

         await caller(authed()).list()

         expect(mocks.listForUser).toHaveBeenCalledWith('u1')
      })

      it('should get by id for the current user', async () => {
         mocks.getForUser.mockResolvedValueOnce(null)

         await caller(authed()).get({ id: 'a1' })

         expect(mocks.getForUser).toHaveBeenCalledWith('u1', 'a1')
      })
   })

   describe('reveal', () => {
      it('should return decrypted secrets for an owned account', async () => {
         mocks.revealForUser.mockResolvedValueOnce({
            email: 'ada@work.com',
            secrets: { password: 'pw' },
         })

         await expect(caller(authed()).reveal({ id: 'a1' })).resolves.toEqual({
            email: 'ada@work.com',
            secrets: { password: 'pw' },
         })
      })

      it('should 404 when the account is not the users', async () => {
         mocks.revealForUser.mockResolvedValueOnce(null)

         await expect(caller(authed()).reveal({ id: 'a1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
   })

   describe('update', () => {
      it('should 404 when the account is not the users', async () => {
         mocks.updateForUser.mockResolvedValueOnce(null)

         await expect(
            caller(authed()).update({
               id: 'a1',
               email: 'x@y.com',
            })
         ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should pass the patch through scoped to the user', async () => {
         mocks.updateForUser.mockResolvedValueOnce({ id: 'a1' })

         await caller(authed()).update({
            id: 'a1',
            password: 'new',
            totpSecret: null,
         })

         expect(mocks.updateForUser).toHaveBeenCalledWith('u1', 'a1', {
            email: undefined,
            secrets: {
               password: 'new',
               totpSecret: null,
               session: undefined,
            },
         })
      })

      it('should normalize a TOTP secret on update and reject an invalid one', async () => {
         mocks.updateForUser.mockResolvedValueOnce({ id: 'a1' })

         await caller(authed()).update({
            id: 'a1',
            totpSecret: 'otpauth://totp/x?secret=swxcks6w42kv2lumetno5mxucjieowdx',
         })

         expect(mocks.updateForUser.mock.calls[0][2].secrets.totpSecret).toBe('SWXCKS6W42KV2LUMETNO5MXUCJIEOWDX')

         await expect(
            caller(authed()).update({
               id: 'a1',
               totpSecret: 'short',
            })
         ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })
   })

   describe('setPaused', () => {
      it('should pause an owned account', async () => {
         mocks.setPausedForUser.mockResolvedValueOnce({
            id: 'a1',
            status: 'DISABLED',
         })

         await expect(
            caller(authed()).setPaused({
               id: 'a1',
               paused: true,
            })
         ).resolves.toEqual({
            id: 'a1',
            status: 'DISABLED',
         })
         expect(mocks.setPausedForUser).toHaveBeenCalledWith('u1', 'a1', true)
      })

      it('should 404 when the account is not the users', async () => {
         mocks.setPausedForUser.mockResolvedValueOnce(null)

         await expect(
            caller(authed()).setPaused({
               id: 'a1',
               paused: false,
            })
         ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should require the paused flag', async () => {
         await expect(caller(authed()).setPaused({ id: 'a1' } as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
         expect(mocks.setPausedForUser).not.toHaveBeenCalled()
      })

      it('should ask for a validation when an account is resumed, and not when it is paused', async () => {
         mocks.setPausedForUser.mockResolvedValueOnce({
            id: 'a1',
            status: 'PENDING',
         })

         await caller(authed()).setPaused({
            id: 'a1',
            paused: false,
         })

         expect(mocks.request).toHaveBeenCalledWith('a1')

         mocks.request.mockClear()
         mocks.setPausedForUser.mockResolvedValueOnce({
            id: 'a1',
            status: 'DISABLED',
         })

         await caller(authed()).setPaused({
            id: 'a1',
            paused: true,
         })

         expect(mocks.request).not.toHaveBeenCalled()
      })

      it('should not validate an account that was already active when resume is pressed', async () => {
         mocks.setPausedForUser.mockResolvedValueOnce({
            id: 'a1',
            status: 'ACTIVE',
         })

         await caller(authed()).setPaused({
            id: 'a1',
            paused: false,
         })

         expect(mocks.request).not.toHaveBeenCalled()
      })
   })

   describe('update triggers', () => {
      it.each([
         ['email', { email: 'new@work.com' }],
         ['password', { password: 'new' }],
         ['two-step key', { totpSecret: 'SWXCKS6W42KV2LUMETNO5MXUCJIEOWDX' }],
         ['cleared token', { session: null }],
      ])('should ask for a validation when the %s is sent and the account is pending again', async (_name, change) => {
         mocks.updateForUser.mockResolvedValueOnce({
            id: 'a1',
            status: 'PENDING',
         })

         await caller(authed()).update({
            id: 'a1',
            ...change,
         })

         expect(mocks.request).toHaveBeenCalledWith('a1')
      })

      it('should not validate when nothing that matters was sent', async () => {
         mocks.updateForUser.mockResolvedValueOnce({
            id: 'a1',
            status: 'PENDING',
         })

         await caller(authed()).update({ id: 'a1' })

         expect(mocks.request).not.toHaveBeenCalled()
      })

      it('should not validate a paused account, which the service leaves disabled', async () => {
         mocks.updateForUser.mockResolvedValueOnce({
            id: 'a1',
            status: 'DISABLED',
         })

         await caller(authed()).update({
            id: 'a1',
            password: 'new',
         })

         expect(mocks.request).not.toHaveBeenCalled()
      })
   })

   describe('verify', () => {
      it('should ask for a validation for an owned account and return its metadata', async () => {
         mocks.verifyForUser.mockResolvedValueOnce({
            id: 'a1',
            status: 'PENDING',
         })

         await expect(caller(authed()).verify({ id: 'a1' })).resolves.toEqual({
            id: 'a1',
            status: 'PENDING',
         })
         expect(mocks.verifyForUser).toHaveBeenCalledWith('u1', 'a1')
      })

      it('should 404 when the account is not the users', async () => {
         mocks.verifyForUser.mockResolvedValueOnce(null)

         await expect(caller(authed()).verify({ id: 'a1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should say a paused account has to be resumed first', async () => {
         mocks.verifyForUser.mockRejectedValueOnce(new mocks.LinkedInAccountPausedError('Resume it'))

         await expect(caller(authed()).verify({ id: 'a1' })).rejects.toMatchObject({
            code: 'PRECONDITION_FAILED',
            message: 'Resume it',
         })
      })

      it('should answer TOO_MANY_REQUESTS inside the cooldown', async () => {
         mocks.verifyForUser.mockRejectedValueOnce(new mocks.LinkedInVerifyCooldownError('Try again in 3 minute(s).'))

         await expect(caller(authed()).verify({ id: 'a1' })).rejects.toMatchObject({
            code: 'TOO_MANY_REQUESTS',
            message: 'Try again in 3 minute(s).',
         })
      })

      it('should reject an anonymous caller', async () => {
         await expect(
            caller({
               auth: null,
               user: null,
            }).verify({ id: 'a1' })
         ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      })
   })

   describe('delete', () => {
      it('should report whether a row was deleted', async () => {
         mocks.deleteForUser.mockResolvedValueOnce(true)

         await expect(caller(authed()).delete({ id: 'a1' })).resolves.toEqual({ deleted: true })
         expect(mocks.deleteForUser).toHaveBeenCalledWith('u1', 'a1')
      })
   })
})
