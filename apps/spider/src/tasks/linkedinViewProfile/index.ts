import { z } from 'zod'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { viewProfile } from './view'

export const TASK_NAME = 'linkedin-view-profile'

type Options = {
   baseUrl: string
}

// A member's profile on LinkedIn, by its public address: https, the site's own host, `/in/<id>` and nothing after it (no query, no
// other page of the profile). `/in/me/` is the account's own profile, which tells nobody anything.
const profileAddress = (baseUrl: string) =>
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
            /^\/in\/[A-Za-z0-9%_.-]{2,150}\/?$/.test(url.pathname) &&
            !/^\/in\/me\/?$/i.test(url.pathname)
         )
      }, 'Not the address of a LinkedIn profile')

// Opens one profile as the account, leaves it for about five seconds and scrolls it to the end, so the member sees a visit
// (.plan/visit-profile-task.md). It starts from the saved session, clicks nothing and reads nothing.
export const createLinkedinViewProfile = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'View someone’s profile',
      description:
         'Opens a member’s profile by its address, waits about five seconds and scrolls down to the end of the page, from the saved session. Nothing is clicked or read.',
      input: z.strictObject({
         profileUrl: profileAddress(baseUrl),
         snapshots: z
            .boolean()
            .default(false)
            .describe('Keep the page with the run, to study how a member’s profile is built.'),
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
            label: 'Profile not available',
            tone: 'neutral',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         ERROR: {
            label: 'The profile could not be opened',
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
            return answerFor(await viewProfile(context, baseUrl, input.profileUrl, input))
         } catch (error) {
            context.warn(describeError(error, 'The profile could not be opened'))

            return {
               status: 'FAILED',
               verdict: 'ERROR',
               message: 'The profile could not be opened.',
            }
         }
      },
   })
