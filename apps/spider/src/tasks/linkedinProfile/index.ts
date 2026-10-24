import { z } from 'zod'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { captureProfile } from './capture'

export const TASK_NAME = 'linkedin-profile'

type Options = {
   baseUrl: string
}

// Opens the account's own profile and the pages behind its "Show all" links and keeps them with the run, to study how they are
// built (.plan/linkedin-profile-task.md, step 1). It starts from the saved session, reads nothing and clicks nothing.
export const createLinkedinProfile = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'LinkedIn profile',
      description:
         'Opens the account’s own profile and the pages behind its Show all links, scrolls each one, and keeps them with the run (markup, links and a picture) so the profile can be read from the real pages. Nothing is clicked or changed.',
      input: z.strictObject({}),
      needs: {
         proxy: 'required',
         account: true,
      },
      hosts: [new URL(baseUrl).hostname],
      verdicts: {
         DONE: {
            label: 'Kept',
            tone: 'success',
         },
         PARTIAL: {
            label: 'Partly kept',
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
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      // The capture begins no new page after 10 minutes (see capture.ts); the rest is room for the one in progress.
      limits: { timeoutMs: 15 * 60 * 1000 },
      recording: { always: true },
      run: async context => {
         // A failure of the task is an answer, not a crash: a crash is run again, and a capture of ten minutes must not be.
         try {
            return answerFor(await captureProfile(context, baseUrl))
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
