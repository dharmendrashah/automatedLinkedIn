import { z } from 'zod'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor, answerForRead } from './answer'
import { captureProfile } from './capture'
import { readProfile } from './read'

export const TASK_NAME = 'linkedin-profile'

type Options = {
   baseUrl: string
}

// Opens the account's own profile and the pages behind its "Show all" links, reads what they show, and hands over `profile.json`
// (.plan/linkedin-profile-task.md). It starts from the saved session and clicks only the chips of Interests. With `capture` it only
// keeps the pages with the run, to study how they are built.
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
            .describe('Only keep the pages (markup, links and a picture) with the run, and read nothing.'),
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
      // The run begins no new page after 10 minutes (see capture.ts and read.ts); the rest is room for the one in progress.
      limits: { timeoutMs: 15 * 60 * 1000 },
      recording: { always: true },
      run: async (context, input) => {
         // A failure of the task is an answer, not a crash: a crash is run again, and a reading of ten minutes must not be.
         try {
            return input.capture
               ? answerFor(await captureProfile(context, baseUrl))
               : answerForRead(await readProfile(context, baseUrl, input))
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
