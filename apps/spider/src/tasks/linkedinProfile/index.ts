import { z } from 'zod'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerForRead } from './answer'
import { readProfile } from './read'

export const TASK_NAME = 'linkedin-profile'

type Options = {
   baseUrl: string
}

// Opens the account's own profile and the pages behind its "Show all" links, reads what they show, and hands over `profile.json`
// (.plan/linkedin-profile-task.md, .plan/linkedin-profile-always-json.md). It starts from the saved session and clicks only the chips
// of Interests. The file comes out of every run; `capture` and `snapshots` only also keep the pages with the run.
export const createLinkedinProfile = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 3,
      title: 'LinkedIn profile',
      description:
         'Opens the account’s own profile and the pages behind its Show all links, scrolls each one, and reads the profile into a file of the run: header, about, experience, education, skills, interests, posts, comments and suggestions. Nothing is changed.',
      input: z.strictObject({
         capture: z
            .boolean()
            .default(false)
            .describe(
               'Also keep the pages (markup, links and a picture) with the run, as snapshots does. The profile is read either way.'
            ),
         snapshots: z
            .boolean()
            .default(false)
            .describe('Also keep the pages with the run when reading, to study how they are built.'),
      }),
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
      budget: {
         estimateS: 300,
         class: 'BACKGROUND',
      },
      policy: {
         // The page's Read profile button asks again after this; the owner can still confirm and read at once.
         cooldownMs: 30 * 60 * 1000,
         oneAtATime: 'account',
      },
      // The run begins no new page after 8 minutes (see read.ts); the rest is room for the one in progress.
      limits: { timeoutMs: 15 * 60 * 1000 },
      recording: { always: true },
      run: async (context, input) => {
         // A failure of the task is an answer, not a crash: a crash is run again, and a reading of ten minutes must not be.
         try {
            return answerForRead(await readProfile(context, baseUrl, { snapshots: input.snapshots || input.capture }))
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
