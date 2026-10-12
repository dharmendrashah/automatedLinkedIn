import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type ValidateAccountCommand, type ValidateAccountResult } from '@automatedLinkedIn/contracts'

import { AccountBusyError } from '../scraping/errors'
import { processValidation } from './processValidation'

const command: ValidateAccountCommand = {
   validation_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   account_id: 'acc1',
   email: 'ada@work.com',
   sealed: {
      ciphertext: 'ct',
      iv: 'iv',
      tag: 'tag',
      key_version: 1,
   },
   requested_at: '2026-10-12T10:00:00.000Z',
}

const cookie = {
   name: 'li_at',
   value: 'TOPSECRETCOOKIE',
   domain: '.linkedin.com',
   path: '/',
}

const NOW = Date.parse('2026-10-12T10:00:05.000Z')

const setup = () => {
   const events: string[] = []

   const session = {
      close: vi.fn(async () => {
         events.push('closed')
      }),
   }
   const driver = {
      open: vi.fn(async () => {
         events.push('opened')

         return session
      }),
   }
   const validator = {
      validate: vi.fn(async () => ({
         outcome: 'VALID' as const,
         cookies: [cookie],
      })),
   }
   const store = {
      put: vi.fn(async (key: string, _body: string, _contentType: string) => {
         events.push(key.startsWith('sessions/') ? 'session' : 'record')
      }),
   }
   const release = vi.fn(async () => {
      events.push('released')
   })
   const accountLock = {
      acquire: vi.fn(async () => {
         events.push('acquired')

         return { release }
      }),
   }
   const openCredentials = vi.fn(() => ({
      password: 'hunter2',
      totpSecret: 'JBSWY3DPEHPK3PXP',
   }))
   const publishResult = vi.fn(async (_result: ValidateAccountResult) => {
      events.push('published')
   })

   return {
      events,
      session,
      driver,
      validator,
      store,
      release,
      accountLock,
      openCredentials,
      publishResult,
      deps: {
         driver,
         validator,
         store,
         accountLock,
         openCredentials,
         publishResult,
         now: () => NOW,
      },
   }
}

describe('processValidation', () => {
   let ctx: ReturnType<typeof setup>

   beforeEach(() => {
      ctx = setup()
   })

   it('should check the credentials in a browser of its own while it holds the lease of the account', async () => {
      await processValidation(command, ctx.deps as never)

      expect(ctx.accountLock.acquire).toHaveBeenCalledWith('acc1', command.validation_id)
      expect(ctx.openCredentials).toHaveBeenCalledWith(command.sealed)
      expect(ctx.validator.validate).toHaveBeenCalledWith(ctx.session, {
         email: 'ada@work.com',
         credentials: {
            password: 'hunter2',
            totpSecret: 'JBSWY3DPEHPK3PXP',
         },
      })
      expect(ctx.events).toEqual(['acquired', 'opened', 'closed', 'session', 'record', 'published', 'released'])
   })

   it("should open the browser through the account's proxy when the command carries one", async () => {
      const proxy = { server: 'socks5://proxy.example.net:1080' }

      await processValidation(
         {
            ...command,
            proxy,
         },
         ctx.deps as never
      )

      expect(ctx.driver.open).toHaveBeenCalledWith({ proxy })
   })

   it('should open the browser directly when the command has no proxy', async () => {
      await processValidation(command, ctx.deps as never)

      expect(ctx.driver.open).toHaveBeenCalledWith({})
   })

   it('should save the session of a valid account, then report where, without the cookie values', async () => {
      await processValidation(command, ctx.deps as never)

      expect(ctx.store.put).toHaveBeenCalledWith(
         'sessions/acc1/state.json',
         JSON.stringify({ cookies: [cookie] }),
         'application/json'
      )
      expect(ctx.publishResult).toHaveBeenCalledWith({
         validation_id: command.validation_id,
         account_id: 'acc1',
         outcome: 'VALID',
         message: expect.any(String),
         session_storage_path: 'sessions/acc1/state.json',
         checked_at: '2026-10-12T10:00:05.000Z',
      })
      expect(JSON.stringify(ctx.publishResult.mock.calls)).not.toContain('TOPSECRETCOOKIE')
   })

   it('should keep a record of the outcome in the bucket, without any cookie', async () => {
      await processValidation(command, ctx.deps as never)

      const record = ctx.store.put.mock.calls.find(([key]) => key.startsWith('results/'))

      expect(record?.[0]).toBe(`results/validate/${command.validation_id}.json`)
      expect(JSON.parse(String(record?.[1]))).toMatchObject({
         validation_id: command.validation_id,
         outcome: 'VALID',
      })
      expect(String(record?.[1])).not.toContain('TOPSECRETCOOKIE')
   })

   it('should not touch the stored session when no cookie of an allowed host is left', async () => {
      ctx.validator.validate.mockResolvedValue({
         outcome: 'VALID' as const,
         cookies: [],
      })

      await processValidation(command, ctx.deps as never)

      expect(ctx.store.put).not.toHaveBeenCalledWith('sessions/acc1/state.json', expect.anything(), expect.anything())
      expect(ctx.publishResult.mock.calls[0][0]).not.toHaveProperty('session_storage_path')
   })

   it.each(['INVALID_CREDENTIALS', 'NEEDS_REAUTH', 'ERROR'] as const)(
      'should report %s with its message and leave the stored session alone',
      async outcome => {
         ctx.validator.validate.mockResolvedValue({
            outcome,
            message: 'Something short',
         } as never)

         await processValidation(command, ctx.deps as never)

         expect(ctx.store.put).not.toHaveBeenCalledWith(
            'sessions/acc1/state.json',
            expect.anything(),
            expect.anything()
         )
         expect(ctx.publishResult).toHaveBeenCalledWith({
            validation_id: command.validation_id,
            account_id: 'acc1',
            outcome,
            message: 'Something short',
            checked_at: '2026-10-12T10:00:05.000Z',
         })
      }
   )

   it('should report ERROR without opening a browser when the credentials cannot be read, and not retry', async () => {
      ctx.openCredentials.mockImplementation(() => {
         throw new Error('Unsupported state or unable to authenticate data')
      })

      await expect(processValidation(command, ctx.deps as never)).resolves.toBeUndefined()

      expect(ctx.driver.open).not.toHaveBeenCalled()
      expect(ctx.publishResult).toHaveBeenCalledWith(
         expect.objectContaining({
            outcome: 'ERROR',
            message: expect.stringMatching(/credentials/i),
         })
      )
      expect(ctx.release).toHaveBeenCalledTimes(1)
   })

   it('should not run when another task holds the account, and report nothing', async () => {
      ctx.accountLock.acquire.mockResolvedValue(undefined as never)

      await expect(processValidation(command, ctx.deps as never)).rejects.toBeInstanceOf(AccountBusyError)
      expect(ctx.driver.open).not.toHaveBeenCalled()
      expect(ctx.publishResult).not.toHaveBeenCalled()
      expect(ctx.release).not.toHaveBeenCalled()
   })

   it('should close the browser and release the lease when the check throws, and let the error through to retry', async () => {
      ctx.validator.validate.mockRejectedValue(new Error('browser crashed'))

      await expect(processValidation(command, ctx.deps as never)).rejects.toThrow('browser crashed')

      expect(ctx.session.close).toHaveBeenCalledTimes(1)
      expect(ctx.release).toHaveBeenCalledTimes(1)
      expect(ctx.publishResult).not.toHaveBeenCalled()
   })

   it('should let a browser that cannot start through to retry, and release the lease', async () => {
      ctx.driver.open.mockRejectedValue(new Error('no display'))

      await expect(processValidation(command, ctx.deps as never)).rejects.toThrow('no display')
      expect(ctx.release).toHaveBeenCalledTimes(1)
   })

   it('should not announce a result when the session cannot be saved', async () => {
      ctx.store.put.mockRejectedValue(new Error('bucket unavailable'))

      await expect(processValidation(command, ctx.deps as never)).rejects.toThrow('bucket unavailable')
      expect(ctx.publishResult).not.toHaveBeenCalled()
      expect(ctx.release).toHaveBeenCalledTimes(1)
   })

   it('should let a publish failure through so the validation is delivered again', async () => {
      ctx.publishResult.mockRejectedValue(new Error('broker down'))

      await expect(processValidation(command, ctx.deps as never)).rejects.toThrow('broker down')
   })

   it('should not let a lease that cannot be released hide the outcome', async () => {
      ctx.release.mockRejectedValue(new Error('bucket unavailable'))

      await expect(processValidation(command, ctx.deps as never)).resolves.toBeUndefined()
      expect(ctx.publishResult).toHaveBeenCalledTimes(1)
   })

   it('should never put a secret in anything it stores or publishes about a failure', async () => {
      ctx.validator.validate.mockResolvedValue({
         outcome: 'INVALID_CREDENTIALS' as const,
         message: 'LinkedIn did not accept the email or password.',
      } as never)

      await processValidation(command, ctx.deps as never)

      const written = JSON.stringify([ctx.store.put.mock.calls, ctx.publishResult.mock.calls])

      expect(written).not.toContain('hunter2')
      expect(written).not.toContain('JBSWY3DPEHPK3PXP')
   })
})
