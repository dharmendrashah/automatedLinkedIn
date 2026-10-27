import { z } from 'zod'

import { MAX_INVITATION_ANSWERS, invitationActionSchema, invitationIdSchema } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { runInvitations } from './run'

export const TASK_NAME = 'linkedin-invitations'

type Options = {
   baseUrl: string
}

const ONCE_EACH = { message: 'A request is answered once in a run.' }

// Reads the connection requests an account received and answers the ones asked for, Accept or Ignore, one at a time at a person's
// pace (.plan/my-network-invitations.md). It starts from the saved session and never types a password. A click is never made twice:
// a command delivered again after a click may have landed answers UNKNOWN.
export const createLinkedinInvitations = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'LinkedIn connection requests',
      description:
         'Opens the connection requests of the account and reads who asked to connect. It can accept or ignore the ones it is asked for, one at a time with a pause between them.',
      input: z.strictObject({
         answers: z
            .array(
               z.strictObject({
                  id: invitationIdSchema.describe("The request's own number, as the list gave it."),
                  action: invitationActionSchema,
               })
            )
            .max(MAX_INVITATION_ANSWERS)
            .refine(answers => new Set(answers.map(({ id }) => id)).size === answers.length, ONCE_EACH)
            .default([])
            .describe('The requests to answer, in this order; none reads the list only.'),
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
            label: 'Not sure an answer took',
            tone: 'neutral',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         ERROR: {
            label: 'The requests could not be read',
            tone: 'failure',
         },
      },
      budget: {
         estimateS: 120,
         class: 'ACTION',
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      // Ten answers with 4 to 9 s between them, a slow page, and the list read before and after.
      limits: { timeoutMs: 8 * 60 * 1000 },
      // The run is kept so an answer that cannot be told as taken or not can be looked at.
      recording: { always: true },
      run: async (context, input) => {
         // A failure is an answer, not a crash: a crash is run again, and an answer must not be.
         try {
            return answerFor(await runInvitations(context, baseUrl, input))
         } catch (error) {
            context.warn(describeError(error, 'The connection requests could not be read'))

            return {
               status: 'FAILED',
               verdict: 'ERROR',
               message: 'The connection requests could not be read.',
            }
         }
      },
   })
