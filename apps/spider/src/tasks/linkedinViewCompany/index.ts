import { z } from 'zod'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { viewCompany } from './view'

export const TASK_NAME = 'linkedin-view-company'

type Options = {
   baseUrl: string
}

// A company page on LinkedIn, by its public address: https, the site's own host, `/company/<name>` and nothing after it (no query,
// no other tab of the page such as /about/ or /jobs/).
const companyAddress = (baseUrl: string) =>
   z
      .string()
      .max(300)
      .refine(value => {
         if (!URL.canParse(value)) {
            return false
         }

         const url = new URL(value)

         return (
            url.protocol === 'https:' &&
            url.hostname === new URL(baseUrl).hostname &&
            url.search === '' &&
            url.hash === '' &&
            /^\/company\/[A-Za-z0-9%_.-]{1,150}\/?$/.test(url.pathname)
         )
      }, 'Not the address of a LinkedIn company page')

// Opens one company page as the account, leaves it for about five seconds and scrolls it to the end (.plan/visit-company-task.md).
// LinkedIn tells a page's admins how many people visited, not who, so this does not alert anyone by name. It starts from the saved
// session, clicks nothing and reads nothing.
export const createLinkedinViewCompany = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'View a company',
      description:
         'Opens a company page by its address, waits about five seconds and scrolls down to the end of the page, from the saved session. Nothing is clicked or read.',
      input: z.strictObject({
         companyUrl: companyAddress(baseUrl),
         snapshots: z
            .boolean()
            .default(false)
            .describe('Keep the page with the run, to study how a company page is built.'),
      }),
      needs: {
         proxy: 'required',
         account: true,
      },
      hosts: [new URL(baseUrl).hostname],
      verdicts: {
         DONE: {
            label: 'Viewed',
            tone: 'success',
         },
         NOT_AVAILABLE: {
            label: 'Company page not available',
            tone: 'neutral',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         ERROR: {
            label: 'The company page could not be opened',
            tone: 'failure',
         },
      },
      budget: {
         estimateS: 150,
         class: 'ACTION',
      },
      policy: {
         // The same account views again only after a few minutes; the owner can confirm and go on.
         cooldownMs: 3 * 60 * 1000,
         oneAtATime: 'account',
      },
      limits: { timeoutMs: 4 * 60 * 1000 },
      recording: { always: true },
      run: async (context, input) => {
         // A failure of the task is an answer, not a crash: a crash is run again, and a visit must not be.
         try {
            return answerFor(await viewCompany(context, baseUrl, input.companyUrl, input))
         } catch (error) {
            context.warn(describeError(error, 'The company page could not be opened'))

            return {
               status: 'FAILED',
               verdict: 'ERROR',
               message: 'The company page could not be opened.',
            }
         }
      },
   })
