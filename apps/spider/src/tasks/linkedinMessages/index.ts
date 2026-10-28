import { z } from 'zod'

import { ROW_HASH_PATTERN } from '@automatedLinkedIn/contracts'

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
      version: 4,
      title: 'LinkedIn messages',
      description:
         'Opens the conversations of the account, newest first, and reads every message with its sender into a file of the run. Opening a conversation marks it read.',
      input: z.strictObject({
         limit: z
            .number()
            .int()
            .min(1)
            .max(500)
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
         known: z
            .array(z.string().regex(ROW_HASH_PATTERN))
            .max(100)
            .default([])
            .describe('Rows of the list the platform already has (by hash): left alone unless unread.'),
         stopAfterKnown: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .describe('Stop after this many rows in a row that were left alone, as everything below is older.'),
         latest: z
            .array(
               z.strictObject({
                  conversation: z.string().regex(ROW_HASH_PATTERN),
                  message: z.string().regex(ROW_HASH_PATTERN),
               })
            )
            .max(100)
            .default([])
            .describe(
               'The newest message the platform holds of some known conversations (short keys): a changed one is read only down to it.'
            ),
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
      budget: {
         estimateS: 180,
         class: 'BACKGROUND',
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      // The reading begins no new conversation after 90 minutes (see read.ts); the rest is room for the one in progress.
      limits: { timeoutMs: 100 * 60 * 1000 },
      run: async (context, input) => {
         // A failure of the task is an answer, not a crash: a crash is run again, and a reading of twenty minutes must not be.
         try {
            return answerFor(await readMessages(context, baseUrl, input))
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
