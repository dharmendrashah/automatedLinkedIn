import { z } from 'zod'

import { type TaskOutcome, VisitError, defineTask } from '../defineTask'
import { type BrowseOutcome, browseLinkedin } from './browse'

export const TASK_NAME = 'linkedin-browse'

type Options = {
   baseUrl: string
}

const ANSWERS: Record<BrowseOutcome | 'ERROR', TaskOutcome> = {
   DONE: {
      status: 'SUCCEEDED',
      verdict: 'DONE',
      message: 'Looked around LinkedIn as the account.',
      commitSession: true,
   },
   SIGNED_OUT: {
      status: 'FAILED',
      verdict: 'SIGNED_OUT',
      message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
   },
   NO_CYCLE: {
      status: 'FAILED',
      verdict: 'ERROR',
      message: 'The visit could not open a post or a profile from the feed.',
   },
   ERROR: {
      status: 'FAILED',
      verdict: 'ERROR',
      message: 'The visit stopped early.',
   },
}

// The daily look around an account that signed in fine, at its own random time (.plan/account-daily-check.md). It starts
// from the saved session and never types a password: a session LinkedIn no longer accepts is the sign-in check's job.
export const createLinkedinBrowse = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'LinkedIn daily visit',
      description:
         'Reads the feed for a few minutes, then goes into five to eight posts and profiles and back, from the saved session.',
      input: z.strictObject({
         snapshots: z
            .boolean()
            .default(false)
            .describe('Keep the feed, a post and a profile with the run, to study how the pages are built.'),
      }),
      needs: {
         proxy: 'required',
         account: true,
      },
      hosts: [new URL(baseUrl).hostname],
      verdicts: {
         DONE: {
            label: 'Visited',
            tone: 'success',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         ERROR: {
            label: 'The visit did not finish',
            tone: 'failure',
         },
      },
      policy: {
         cooldownMs: 60 * 60 * 1000,
         oneAtATime: 'account',
      },
      // The walk begins no new target after 9.5 minutes (see walk.ts); the rest is room for the one in progress.
      limits: { timeoutMs: 12 * 60 * 1000 },
      recording: {
         videoSize: {
            width: 640,
            height: 360,
         },
      },
      run: async (context, { snapshots }) => {
         // A failure of the walk is an answer, not a crash: a crash is run again, and a visit of ten minutes must not be.
         try {
            return ANSWERS[await browseLinkedin(context, baseUrl, Math.random, snapshots)]
         } catch (error) {
            context.warn(error instanceof VisitError ? error.message : 'The visit stopped early')

            return ANSWERS.ERROR
         }
      },
   })
