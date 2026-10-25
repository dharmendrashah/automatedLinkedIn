import { z } from 'zod'

import { SECURITY_CHECK_MESSAGE } from '@automatedLinkedIn/contracts'

import { type TaskOutcome, defineTask } from '../defineTask'
import { type AccountValidator, type Verdict } from './accountValidator'
import { browseAfterLogin } from './browseAfterLogin'

export const TASK_NAME = 'linkedin-login'

type Options = {
   validator: Pick<AccountValidator, 'validate' | 'recheck'>
   baseUrl: string
}

const answerOf = (verdict: Verdict): TaskOutcome => {
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
         BLOCKED: {
            label: 'Account blocked',
            tone: 'failure',
         },
         ERROR: {
            label: 'Could not check',
            tone: 'neutral',
         },
      },
      // A different address may get past a security check or a page that did not load.
      retryOn: ['ERROR', 'SECURITY_CHECK'],
      budget: {
         estimateS: 120,
         class: 'SYSTEM',
      },
      policy: {
         // Brain keeps the owner's 5 minute wait between two sign-ins of one account; this only stops two at once.
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      limits: { timeoutMs: 3 * 60 * 1000 },
      // A small video keeps the worker's memory down; it is enough to read the sign-in pages.
      recording: {
         videoSize: {
            width: 640,
            height: 360,
         },
      },
      run: async (context): Promise<TaskOutcome> => {
         const { browser, account } = context

         if (!account) {
            throw new Error('The runner gave linkedin-login no account')
         }

         // Signed in: look around like the owner would, then the session is kept only if the browser is still signed in.
         // Anything else keeps the page it ended on, so a page this task does not understand can be read afterwards.
         const afterwards = async (found: Verdict): Promise<TaskOutcome> => {
            const answer = answerOf(found)

            if (answer.verdict === 'VALID') {
               return {
                  ...answer,
                  commitSession: await browseAfterLogin(context, baseUrl),
               }
            }

            try {
               context.attach('page.html', await browser.pageHtml(), 'text/html')
            } catch {
               // The page is only for reading; a browser that is gone changes nothing about the answer.
            }

            return answer
         }

         const answer = await afterwards(
            await validator.validate(browser, {
               email: account.email,
               credentials: account.credentials,
               ...(context.language && { language: context.language }),
            })
         )
         const resume = async () => afterwards(await validator.recheck(browser, account.credentials))

         // A security check is the owner's to complete. If they do, the same page is looked at again, never retyped.
         return answer.verdict === 'SECURITY_CHECK'
            ? {
                 ...answer,
                 needsPerson: { resume },
              }
            : answer
      },
   })
