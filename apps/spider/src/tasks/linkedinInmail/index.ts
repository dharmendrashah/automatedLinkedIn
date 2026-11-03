import { z } from 'zod'

import { MAX_ATTACHMENTS, UPLOAD_ID, connectionSlugSchema, replyFileSchema } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { sendInmail } from './send'

const WORDS_OR_FILES = { message: 'A message needs words or files.' }
const UPLOAD_FOR_FILES = { message: 'Files need the upload they are kept in.' }

export const TASK_NAME = 'linkedin-inmail'

// The most characters LinkedIn takes in the subject and in the words of a free message; not yet seen on the page, so taken from the
// owner's decision (.plan/linkedin-inmail.md). The command that carries them may not pass 8 KB once it is written as JSON.
export const MAX_SUBJECT_CHARS = 200
export const MAX_INMAIL_CHARS = 1900

type Options = {
   baseUrl: string
}

// Writes a free message to a member the account is not connected to (.plan/linkedin-inmail.md), as the member would, and says whether it
// went. It never starts a message that costs a credit, and never types twice: a command delivered again after the send may have been
// pressed answers UNKNOWN.
export const createLinkedinInmail = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'LinkedIn InMail',
      description:
         "Opens the profile of a member the account is not connected to, presses Message, checks LinkedIn's window says the message is free and is for that person, types the subject and the words at a person's pace and presses send, then checks it shows. It can attach images, documents and videos first (audio is an experiment).",
      input: z
         .strictObject({
            slug: connectionSlugSchema.describe('The profile address after /in/.'),
            subject: z.string().trim().max(MAX_SUBJECT_CHARS).default('').describe('The subject; may be empty.'),
            text: z
               .string()
               .trim()
               .max(MAX_INMAIL_CHARS)
               .default('')
               .describe('The message; may be empty when there are files.'),
            files: z
               .array(replyFileSchema)
               .max(MAX_ATTACHMENTS)
               .default([])
               .describe('The files to attach, by the names they have in the upload.'),
            uploadId: z.string().regex(UPLOAD_ID).optional().describe('Where brain keeps the files.'),
         })
         .refine(({ text, files }) => text !== '' || files.length > 0, WORDS_OR_FILES)
         .refine(({ files, uploadId }) => files.length === 0 || uploadId !== undefined, UPLOAD_FOR_FILES),
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
         DIFFERENT_WORDS: {
            label: 'Sent with other words',
            tone: 'failure',
         },
         NO_MESSAGE_BUTTON: {
            label: 'No Message button',
            tone: 'failure',
         },
         NOT_INMAIL: {
            label: 'Ordinary conversation opened',
            tone: 'failure',
         },
         WOULD_COST_CREDIT: {
            label: 'Not free',
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
      // The owner's choice: a pause of two minutes between two of these on one account, which counts in its caps.
      policy: {
         cooldownMs: 120_000,
         oneAtATime: 'account',
      },
      // Files upload through the proxy: the page can take minutes to take them in.
      limits: { timeoutMs: 5 * 60 * 1000 },
      // The run is kept so a message that cannot be told as sent or not can be looked at.
      recording: { always: true },
      run: async (context, input) => {
         // A failure is an answer, not a crash: a crash is run again, and a message must not be.
         try {
            return answerFor(await sendInmail(context, baseUrl, input))
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
