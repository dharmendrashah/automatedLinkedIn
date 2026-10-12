import { describe, expect, it, vi } from 'vitest'

import { SECURITY_CHECK_MESSAGE, taskCatalogEntrySchema } from '@automatedLinkedIn/contracts'

import { catalogEntryOf } from '../catalog'
import { type TaskContext } from '../defineTask'
import { type AccountValidator, type Verdict } from './accountValidator'
import { TASK_NAME, createLinkedinLogin } from './index'

const credentials = { password: 'hunter2-password' }

const run = async (verdict: Verdict) => {
   const validator = { validate: vi.fn(async () => verdict) } as unknown as Pick<AccountValidator, 'validate'>
   const browser = {}
   const context = {
      browser,
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
      browser,
   }
}

describe('linkedin-login task', () => {
   it('should be a valid task for the catalog that needs a proxy and an account', () => {
      const task = createLinkedinLogin({
         validator: { validate: vi.fn() },
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

   it('should only answer with verdicts it declared', async () => {
      const task = createLinkedinLogin({
         validator: { validate: vi.fn() },
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
      ]) {
         const { outcome } = await run(verdict)

         expect(Object.keys(task.verdicts)).toContain(outcome.verdict)
      }
   })
})
