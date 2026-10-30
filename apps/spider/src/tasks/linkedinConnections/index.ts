import { z } from 'zod'

import { connectionSlugSchema } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { runConnections } from './run'

export const TASK_NAME = 'linkedin-connections'

type Options = {
   baseUrl: string
}

// Reads the connections an account has and removes the one it is asked for, at a person's pace (.plan/my-connections.md). It starts
// from the saved session and never types a password. Remove is never pressed twice: a command delivered again after it may have been
// pressed answers UNKNOWN.
export const createLinkedinConnections = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 2,
      title: 'LinkedIn connections',
      description:
         'Opens the connections of the account and reads who they are, scrolling the whole list. It can remove one connection it is asked for, after checking that the dialog names the same person.',
      input: z.strictObject({
         remove: connectionSlugSchema
            .optional()
            .describe(
               'The connection to remove, by the part of its profile address after /in/; none reads the list only.'
            ),
         stopAtKnown: z
            .array(connectionSlugSchema)
            .max(50)
            .optional()
            .describe(
               'The newest connections already stored: the read stops at the first of them, since the list shows the most recent first.'
            ),
      }),
      needs: {
         proxy: 'required',
         account: true,
      },
      hosts: [new URL(baseUrl).hostname],
      verdicts: {
         DONE: {
            label: 'Done',
            tone: 'success',
         },
         PARTIAL: {
            label: 'Partly done',
            tone: 'neutral',
         },
         UNKNOWN: {
            label: 'Not sure a removal took',
            tone: 'neutral',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         ERROR: {
            label: 'The connections could not be read',
            tone: 'failure',
         },
      },
      // What the owner asks for counts as an action (`classOf` in brain); a long list loads ten rows at a time.
      budget: {
         estimateS: 600,
         class: 'BACKGROUND',
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      // A list of a thousand loads ten at a time at a person's pace; the read stops itself after 20 minutes.
      limits: { timeoutMs: 25 * 60 * 1000 },
      // The run is kept so a removal that cannot be told as taken or not can be looked at.
      recording: { always: true },
      run: async (context, input) => {
         // A failure is an answer, not a crash: a crash is run again, and a removal must not be.
         try {
            return answerFor(await runConnections(context, baseUrl, input))
         } catch (error) {
            context.warn(describeError(error, 'The connections could not be read'))

            return {
               status: 'FAILED',
               verdict: 'ERROR',
               message: 'The connections could not be read.',
            }
         }
      },
   })
