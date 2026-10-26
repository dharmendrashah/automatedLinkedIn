import { describe, expect, it, vi } from 'vitest'

import { SECURITY_CHECK_MESSAGE, taskCatalogEntrySchema } from '@automatedLinkedIn/contracts'

import { catalogEntryOf } from '../catalog'
import { type TaskContext } from '../defineTask'
import { type AccountValidator, type Verdict } from './accountValidator'
import { browseAfterLogin } from './browseAfterLogin'
import { TASK_NAME, createLinkedinLogin } from './index'

vi.mock('./browseAfterLogin', () => ({ browseAfterLogin: vi.fn(async () => true) }))

const credentials = { password: 'hunter2-password' }

const run = async (verdict: Verdict, recheck: Verdict = verdict) => {
   const validator = {
      validate: vi.fn(async () => verdict),
      recheck: vi.fn(async () => recheck),
   } as unknown as Pick<AccountValidator, 'validate' | 'recheck'>
   const browser = { pageHtml: vi.fn(async () => '<html>login</html>') }
   const attach = vi.fn()
   const keepSession = vi.fn(async () => undefined)
   const context = {
      browser,
      attach,
      keepSession,
      account: {
         id: 'acc1',
         email: 'ada@example.com',
         credentials,
      },
   } as unknown as TaskContext
   const outcome = await createLinkedinLogin({
      validator,
      baseUrl: 'https://www.linkedin.com',
   }).run(context, {})

   return {
      outcome,
      validate: vi.mocked(validator.validate),
      recheck: vi.mocked(validator.recheck),
      browser,
      attach,
      keepSession,
   }
}

describe('linkedin-login task', () => {
   it('should be a valid task for the catalog that needs a proxy and an account', () => {
      const task = createLinkedinLogin({
         validator: {
            validate: vi.fn(),
            recheck: vi.fn(),
         },
         baseUrl: 'https://www.linkedin.com',
      })
      const entry = catalogEntryOf(task)

      expect(task.name).toBe(TASK_NAME)
      expect(taskCatalogEntrySchema.safeParse(entry).success).toBe(true)
      expect(entry).toMatchObject({
         needs: {
            proxy: 'required',
            account: true,
         },
         hosts: ['www.linkedin.com'],
         policy: { one_at_a_time: 'account' },
         retry_on: ['ERROR', 'SECURITY_CHECK'],
      })
   })

   it('should sign in with the account the runner opened, on the browser it was given', async () => {
      const { validate, browser } = await run({
         outcome: 'VALID',
         cookies: [],
      })

      expect(validate).toHaveBeenCalledWith(browser, {
         email: 'ada@example.com',
         credentials,
      })
   })

   it('should keep the session right after a good sign-in, before it looks around, and not after a failed one', async () => {
      const good = await run({
         outcome: 'VALID',
         cookies: [],
      })

      expect(good.keepSession).toHaveBeenCalledOnce()
      expect(vi.mocked(good.keepSession).mock.invocationCallOrder[0]).toBeLessThan(
         vi.mocked(browseAfterLogin).mock.invocationCallOrder.at(-1) ?? 0
      )

      const bad = await run({
         outcome: 'INVALID_CREDENTIALS',
         message: 'No.',
      })

      expect(bad.keepSession).not.toHaveBeenCalled()
   })

   it('should succeed and keep the session when the login worked', async () => {
      const { outcome } = await run({
         outcome: 'VALID',
         cookies: [],
      })

      expect(outcome).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'VALID',
         message: 'Signed in to LinkedIn.',
         commitSession: true,
      })
   })

   it.each([
      ['INVALID_CREDENTIALS', 'LinkedIn did not accept the email or password.'],
      ['NEEDS_REAUTH', 'LinkedIn asked for a two-step code and no two-step key is stored.'],
      ['ERROR', 'LinkedIn did not let the check load a page.'],
   ] as const)('should fail with the verdict %s and never keep the session', async (code, message) => {
      const { outcome } = await run({
         outcome: code,
         message,
      })

      expect(outcome).toMatchObject({
         status: 'FAILED',
         verdict: code,
         message,
      })
      expect(outcome.commitSession).toBeUndefined()
   })

   it('should give a security check its own verdict, because another proxy may get past it', async () => {
      const { outcome } = await run({
         outcome: 'NEEDS_REAUTH',
         message: SECURITY_CHECK_MESSAGE,
      })

      expect(outcome).toMatchObject({
         status: 'FAILED',
         verdict: 'SECURITY_CHECK',
      })
   })

   it('should ask for the owner at a security check, and sign in once they have finished it', async () => {
      const { outcome, recheck, browser } = await run(
         {
            outcome: 'NEEDS_REAUTH',
            message: SECURITY_CHECK_MESSAGE,
         },
         {
            outcome: 'VALID',
            cookies: [],
         }
      )

      expect(outcome.needsPerson).toBeDefined()
      expect(recheck).not.toHaveBeenCalled()

      await expect(outcome.needsPerson?.resume()).resolves.toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'VALID',
         commitSession: true,
      })
      expect(recheck).toHaveBeenCalledWith(browser, credentials)
   })

   it('should still be a security check when the owner did not get through it, and not ask again', async () => {
      const { outcome } = await run({
         outcome: 'NEEDS_REAUTH',
         message: SECURITY_CHECK_MESSAGE,
      })

      await expect(outcome.needsPerson?.resume()).resolves.toMatchObject({
         status: 'FAILED',
         verdict: 'SECURITY_CHECK',
         message: SECURITY_CHECK_MESSAGE,
      })
      expect((await outcome.needsPerson?.resume())?.needsPerson).toBeUndefined()
   })

   it.each([
      [
         {
            outcome: 'INVALID_CREDENTIALS' as const,
            message: 'x',
         },
      ],
      [
         {
            outcome: 'NEEDS_REAUTH' as const,
            message: 'LinkedIn asked for a two-step code and no two-step key is stored.',
         },
      ],
      [
         {
            outcome: 'ERROR' as const,
            message: 'x',
         },
      ],
   ])('should not ask for the owner when only they cannot help: %j', async verdict => {
      const { outcome } = await run(verdict)

      expect(outcome.needsPerson).toBeUndefined()
   })

   it('should look around after a valid sign-in, and keep the session only while the browser is still signed in', async () => {
      const verdict = {
         outcome: 'VALID' as const,
         cookies: [],
      }

      vi.mocked(browseAfterLogin).mockResolvedValueOnce(false)

      expect((await run(verdict)).outcome.commitSession).toBe(false)
      expect(browseAfterLogin).toHaveBeenCalledWith(expect.anything(), 'https://www.linkedin.com')
   })

   it('should not look around after a sign-in that failed', async () => {
      vi.mocked(browseAfterLogin).mockClear()

      await run({
         outcome: 'ERROR',
         message: 'x',
      })

      expect(browseAfterLogin).not.toHaveBeenCalled()
   })

   it('should look around after the owner finished a security check as well', async () => {
      vi.mocked(browseAfterLogin).mockClear()

      const { outcome } = await run(
         {
            outcome: 'NEEDS_REAUTH',
            message: SECURITY_CHECK_MESSAGE,
         },
         {
            outcome: 'VALID',
            cookies: [],
         }
      )

      await outcome.needsPerson?.resume()

      expect(browseAfterLogin).toHaveBeenCalledTimes(1)
   })

   it('should keep the page it ended on when the sign-in did not work, and not when it did', async () => {
      const failed = await run({
         outcome: 'ERROR',
         message: 'x',
      })

      expect(failed.attach).toHaveBeenCalledWith('page.html', '<html>login</html>', 'text/html')

      const worked = await run({
         outcome: 'VALID',
         cookies: [],
      })

      expect(worked.attach).not.toHaveBeenCalled()
   })

   it('should sign in in the language of the account when the run has one', async () => {
      const validate = vi.fn(async () => ({
         outcome: 'ERROR' as const,
         message: 'x',
      }))
      const context = {
         browser: { pageHtml: vi.fn(async () => '') },
         attach: vi.fn(),
         language: 'en-US',
         account: {
            id: 'acc1',
            email: 'ada@example.com',
            credentials,
         },
      } as unknown as TaskContext

      await createLinkedinLogin({
         validator: {
            validate,
            recheck: vi.fn(),
         } as unknown as Pick<AccountValidator, 'validate' | 'recheck'>,
         baseUrl: 'https://www.linkedin.com',
      }).run(context, {})

      expect(validate).toHaveBeenCalledWith(context.browser, expect.objectContaining({ language: 'en-US' }))
   })

   it('should still answer when the page cannot be read', async () => {
      const validator = {
         validate: vi.fn(async () => ({
            outcome: 'ERROR' as const,
            message: 'x',
         })),
         recheck: vi.fn(),
      } as unknown as Pick<AccountValidator, 'validate' | 'recheck'>
      const context = {
         browser: {
            pageHtml: vi.fn(async () => {
               throw new Error('closed')
            }),
         },
         attach: vi.fn(),
         account: {
            id: 'acc1',
            email: 'ada@example.com',
            credentials,
         },
      } as unknown as TaskContext

      await expect(
         createLinkedinLogin({
            validator,
            baseUrl: 'https://www.linkedin.com',
         }).run(context, {})
      ).resolves.toMatchObject({ verdict: 'ERROR' })
   })

   it('should report a restricted account as BLOCKED, never keep its session and not ask for the owner', async () => {
      const { outcome } = await run({
         outcome: 'BLOCKED',
         message: 'LinkedIn restricted this account. Open LinkedIn yourself to see why.',
      })

      expect(outcome).toMatchObject({
         status: 'FAILED',
         verdict: 'BLOCKED',
      })
      expect(outcome.commitSession).toBeUndefined()
      expect(outcome.needsPerson).toBeUndefined()
   })

   it('should only answer with verdicts it declared', async () => {
      const task = createLinkedinLogin({
         validator: {
            validate: vi.fn(),
            recheck: vi.fn(),
         },
         baseUrl: 'https://www.linkedin.com',
      })

      for (const verdict of [
         {
            outcome: 'VALID' as const,
            cookies: [],
         },
         {
            outcome: 'ERROR' as const,
            message: 'x',
         },
         {
            outcome: 'NEEDS_REAUTH' as const,
            message: SECURITY_CHECK_MESSAGE,
         },
         {
            outcome: 'BLOCKED' as const,
            message: 'x',
         },
      ]) {
         const { outcome } = await run(verdict)

         expect(Object.keys(task.verdicts)).toContain(outcome.verdict)
      }
   })
})
