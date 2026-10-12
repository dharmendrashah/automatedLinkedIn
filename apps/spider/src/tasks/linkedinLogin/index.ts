import { z } from 'zod'

import { SECURITY_CHECK_MESSAGE } from '@automatedLinkedIn/contracts'

import { type TaskOutcome, defineTask } from '../defineTask'
import { type AccountValidator } from './accountValidator'

export const TASK_NAME = 'linkedin-login'

type Options = {
   validator: Pick<AccountValidator, 'validate'>
   baseUrl: string
}

// Signs in to LinkedIn once with what is stored for the account. A wrong password or a wrong code is an answer, because
// repeating it is how accounts get locked. Only a login that worked replaces the saved session.
export const createLinkedinLogin = ({ validator, baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'LinkedIn sign-in check',
      description: 'Signs in to LinkedIn with the stored credentials and keeps the session when it works.',
      input: z.strictObject({}),
      needs: {
         proxy: 'required',
         account: true,
      },
      hosts: [new URL(baseUrl).hostname],
      verdicts: {
         VALID: {
            label: 'Signed in',
            tone: 'success',
         },
         INVALID_CREDENTIALS: {
            label: 'Wrong credentials',
            tone: 'failure',
         },
         SECURITY_CHECK: {
            label: 'Security check',
            tone: 'failure',
         },
         NEEDS_REAUTH: {
            label: 'Needs your attention',
            tone: 'failure',
         },
         ERROR: {
            label: 'Could not check',
            tone: 'neutral',
         },
      },
      // A different address may get past a security check or a page that did not load.
      retryOn: ['ERROR', 'SECURITY_CHECK'],
      policy: {
         // Brain keeps the owner's 5 minute wait between two sign-ins of one account; this only stops two at once.
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      limits: { timeoutMs: 3 * 60 * 1000 },
      run: async ({ browser, account }): Promise<TaskOutcome> => {
         if (!account) {
            throw new Error('The runner gave linkedin-login no account')
         }

         const verdict = await validator.validate(browser, {
            email: account.email,
            credentials: account.credentials,
         })

         if (verdict.outcome === 'VALID') {
            return {
               status: 'SUCCEEDED',
               verdict: 'VALID',
               message: 'Signed in to LinkedIn.',
               commitSession: true,
            }
         }

         return {
            status: 'FAILED',
            verdict: verdict.message === SECURITY_CHECK_MESSAGE ? 'SECURITY_CHECK' : verdict.outcome,
            message: verdict.message,
         }
      },
   })
