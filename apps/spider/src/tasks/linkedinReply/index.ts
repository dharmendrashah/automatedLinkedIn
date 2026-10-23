import { z } from 'zod'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { sendReply } from './send'

export const TASK_NAME = 'linkedin-reply'

type Options = {
   baseUrl: string
}

// The most characters of a reply: the command that carries it may not pass 8 KB once it is written as JSON.
export const MAX_REPLY_CHARS = 4000

// Writes one reply in a conversation of the account's messages (.plan/unibox-send.md), as the member would, and says whether it
// went. A reply is never typed twice: a command delivered again after the send may have been pressed answers UNKNOWN.
export const createLinkedinReply = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'LinkedIn reply',
      description:
         "Opens a conversation of the account, types a reply in its box at a person's pace and presses send, then checks the message shows. Text only.",
      input: z.strictObject({
         thread: z
            .string()
            .regex(/^[\w=.%-]{1,200}$/)
            .describe('The id of the conversation, as in the address of its page.'),
         title: z
            .string()
            .max(300)
            .describe('The name of the conversation as the page shows it; typed nowhere if the page shows another.'),
         text: z.string().trim().min(1).max(MAX_REPLY_CHARS).describe('The reply.'),
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
         NO_COMPOSER: {
            label: 'Cannot reply here',
            tone: 'failure',
         },
         WRONG_THREAD: {
            label: 'Another conversation opened',
            tone: 'failure',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         ERROR: {
            label: 'The reply could not be sent',
            tone: 'failure',
         },
      },
      policy: {
         cooldownMs: 0,
         oneAtATime: 'account',
      },
      limits: { timeoutMs: 5 * 60 * 1000 },
      // The run is kept so a reply that cannot be told as sent or not can be looked at.
      recording: { always: true },
      run: async (context, input) => {
         // A failure is an answer, not a crash: a crash is run again, and a reply must not be.
         try {
            return answerFor(await sendReply(context, baseUrl, input))
         } catch (error) {
            context.warn(describeError(error, 'The reply could not be sent'))

            return {
               status: 'FAILED',
               verdict: 'ERROR',
               message: 'The reply could not be sent.',
            }
         }
      },
   })
