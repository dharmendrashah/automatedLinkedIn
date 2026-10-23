import { z } from 'zod'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { readMessages } from './read'

export const TASK_NAME = 'linkedin-messages'

type Options = {
   baseUrl: string
}

// Reads the conversations of an account's messages and hands every message, with who sent it, to the run as `messages.json`
// (.plan/linkedin-messages.md). It starts from the saved session and never types a password.
export const createLinkedinMessages = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 2,
      title: 'LinkedIn messages',
      description:
         'Opens the conversations of the account, newest first, and reads every message with its sender into a file of the run. Opening a conversation marks it read.',
      input: z.strictObject({
         limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(50)
            .describe('How many conversations to read, newest activity first.'),
         skip: z
            .number()
            .int()
            .min(0)
            .max(5000)
            .default(0)
            .describe(
               'How many conversations at the top of the list to leave out, to go on where an earlier run stopped.'
            ),
         snapshots: z
            .boolean()
            .default(false)
            .describe('Keep the messages pages with the run, to study how they are built.'),
      }),
      needs: {
         proxy: 'required',
         account: true,
      },
      hosts: [new URL(baseUrl).hostname],
      verdicts: {
         DONE: {
            label: 'Read',
            tone: 'success',
         },
         PARTIAL: {
            label: 'Partly read',
            tone: 'neutral',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         ERROR: {
            label: 'The messages could not be read',
            tone: 'failure',
         },
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      // The reading begins no new conversation after 20 minutes (see read.ts); the rest is room for the one in progress.
      limits: { timeoutMs: 25 * 60 * 1000 },
      run: async (context, input) => {
         // A failure of the task is an answer, not a crash: a crash is run again, and a reading of twenty minutes must not be.
         try {
            return answerFor(await readMessages(context, baseUrl, input), input.skip)
         } catch (error) {
            context.warn(describeError(error, 'The messages could not be read'))

            return {
               status: 'FAILED',
               verdict: 'ERROR',
               message: 'The messages could not be read.',
            }
         }
      },
   })
