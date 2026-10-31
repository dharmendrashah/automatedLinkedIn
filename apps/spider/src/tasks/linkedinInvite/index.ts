import { inviteInputSchema } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { runInvites } from './run'

export const TASK_NAME = 'linkedin-invite'

type Options = {
   baseUrl: string
}

// Sends connection invites from people's profiles and withdraws old ones from the Sent list, as the member would
// (.plan/network-invites.md). Nothing is pressed twice: a command delivered again after a press may have landed answers UNKNOWN.
export const createLinkedinInvite = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 2,
      title: 'LinkedIn invites',
      description:
         "Opens each person's profile, presses Connect, adds the note when there is one (or sends without it when LinkedIn has no free notes left) and presses Send, 30 to 90 seconds apart. It can also withdraw invites from the Sent list.",
      input: inviteInputSchema,
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
            label: 'Not sure an invite took',
            tone: 'neutral',
         },
         LIMIT_REACHED: {
            label: 'LinkedIn limit reached',
            tone: 'failure',
         },
         RESTRICTED: {
            label: 'Account restricted',
            tone: 'failure',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         ERROR: {
            label: 'The invites could not be sent',
            tone: 'failure',
         },
      },
      // Five profiles with 30 to 90 s between them, and the Sent list.
      budget: {
         estimateS: 420,
         class: 'ACTION',
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      limits: { timeoutMs: 15 * 60 * 1000 },
      // The run is kept so an invite that cannot be told as sent or not can be looked at.
      recording: { always: true },
      run: async (context, input) => {
         // A failure is an answer, not a crash: a crash is run again, and an invite must not be.
         try {
            return answerFor(await runInvites(context, baseUrl, input))
         } catch (error) {
            context.warn(describeError(error, 'The invites could not be sent'))

            return {
               status: 'FAILED',
               verdict: 'ERROR',
               message: 'The invites could not be sent.',
            }
         }
      },
   })
