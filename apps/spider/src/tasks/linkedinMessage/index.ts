import { z } from 'zod'

import { connectionSlugSchema } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { MAX_REPLY_CHARS } from '../linkedinReply'
import { answerFor } from './answer'
import { sendMessage } from './send'

export const TASK_NAME = 'linkedin-message'

type Options = {
   baseUrl: string
}

// Writes a first message to a connection from their profile (.plan/message-connections.md), as the member would, and says whether it
// went. A message is never typed twice: a command delivered again after the send may have been pressed answers UNKNOWN.
export const createLinkedinMessage = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'LinkedIn message',
      description:
         "Opens a connection's profile, presses Message, checks the window is with that person, types the message at a person's pace and presses send, then checks it shows.",
      input: z.strictObject({
         slug: connectionSlugSchema.describe('The profile address after /in/.'),
         name: z.string().trim().min(1).max(200).describe('The name of the person, to check the window is with them.'),
         text: z.string().trim().min(1).max(MAX_REPLY_CHARS).describe('The message.'),
      }),
      needs: {
         proxy: 'required',
         account: true,
      },
      hosts: [new URL(baseUrl).hostname],
      verdicts: {
         SENT: {
            label: 'Sent',
            tone: 'success',
         },
         UNKNOWN: {
            label: 'Not sure if sent',
            tone: 'neutral',
         },
         FAILED: {
            label: 'Not sent',
            tone: 'failure',
         },
         NO_MESSAGE_BUTTON: {
            label: 'No Message button',
            tone: 'failure',
         },
         NO_COMPOSER: {
            label: 'Cannot write here',
            tone: 'failure',
         },
         WRONG_RECIPIENT: {
            label: 'Another person opened',
            tone: 'failure',
         },
         NOT_AVAILABLE: {
            label: 'Profile not available',
            tone: 'failure',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         ERROR: {
            label: 'The message could not be sent',
            tone: 'failure',
         },
      },
      budget: {
         estimateS: 90,
         class: 'ACTION',
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      limits: { timeoutMs: 5 * 60 * 1000 },
      // The run is kept so a message that cannot be told as sent or not can be looked at.
      recording: { always: true },
      run: async (context, input) => {
         // A failure is an answer, not a crash: a crash is run again, and a message must not be.
         try {
            return answerFor(await sendMessage(context, baseUrl, input))
         } catch (error) {
            context.warn(describeError(error, 'The message could not be sent'))

            return {
               status: 'FAILED',
               verdict: 'ERROR',
               message: 'The message could not be sent.',
            }
         }
      },
   })
