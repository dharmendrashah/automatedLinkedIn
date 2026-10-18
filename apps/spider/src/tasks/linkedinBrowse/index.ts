import { z } from 'zod'

import { type TaskOutcome, defineTask } from '../defineTask'
import { browseLinkedin } from './browse'

export const TASK_NAME = 'linkedin-browse'

type Options = {
   baseUrl: string
}

const ANSWERS: Record<'DONE' | 'SIGNED_OUT', TaskOutcome> = {
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
}

// The daily look around an account that signed in fine, at its own random time (.plan/account-daily-check.md). It starts
// from the saved session and never types a password: a session LinkedIn no longer accepts is the sign-in check's job.
export const createLinkedinBrowse = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'LinkedIn daily visit',
      description: 'Reads the feed, the own profile and one or two posts with their authors, from the saved session.',
      input: z.strictObject({}),
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
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      limits: { timeoutMs: 6 * 60 * 1000 },
      recording: {
         videoSize: {
            width: 640,
            height: 360,
         },
      },
      run: async context => ANSWERS[await browseLinkedin(context, baseUrl)],
   })
