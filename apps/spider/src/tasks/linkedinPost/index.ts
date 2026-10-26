import { z } from 'zod'

import { POST_TEXT_MAX, characterCount, postTaskFilesSchema } from '@automatedLinkedIn/contracts'

import { describeError } from '../../browsing/errors'
import { defineTask } from '../defineTask'
import { answerFor } from './answer'
import { sendPost } from './post'

export const TASK_NAME = 'linkedin-post'

type Options = {
   baseUrl: string
}

// Writes one text post, with a link in its words when it has one, on the account's own page (.plan/posting-send-task.md), as the
// member would, and gives the address of the post. A post is never typed twice: a command delivered again after Post may have been
// pressed answers UNKNOWN.
export const createLinkedinPost = ({ baseUrl }: Options) =>
   defineTask({
      name: TASK_NAME,
      version: 1,
      title: 'LinkedIn post',
      description:
         "Opens the post composer of the account, sets who sees the post and who may comment, types the words at a person's pace and presses Post, then reads the address of the post from LinkedIn's own message and opens the post for a few seconds. It can post up to ten photos, or one video, or one document with the words.",
      input: z
         .strictObject({
            text: z
               .string()
               .trim()
               .default('')
               .refine(value => characterCount(value) <= POST_TEXT_MAX, `At most ${POST_TEXT_MAX} characters.`)
               .describe(
                  'The words of the post. A link goes in them, after a space, and LinkedIn draws its preview card. May be empty when there are files.'
               ),
            files: postTaskFilesSchema
               .describe(
                  'Up to ten photos, or one video, or one document, each told by its file id and name; the run fetches them itself.'
               )
               .default([]),
            audience: z
               .enum(['ANYONE', 'CONNECTIONS'])
               .default('ANYONE')
               .describe(
                  'Who sees the post. It is set before anything is typed; nothing is typed when it cannot be set.'
               ),
            comments: z
               .enum(['ANYONE', 'CONNECTIONS', 'OFF'])
               .default('ANYONE')
               .describe(
                  'Who may comment. It is set before anything is typed; nothing is typed when it cannot be set.'
               ),
         })
         .refine(({ text, files }) => text !== '' || files.length > 0, { message: 'A post needs words or files.' }),
      needs: {
         proxy: 'required',
         account: true,
      },
      hosts: [new URL(baseUrl).hostname],
      verdicts: {
         POSTED: {
            label: 'Posted',
            tone: 'success',
         },
         POSTED_NO_LINK: {
            label: 'Posted, no link',
            tone: 'neutral',
         },
         UNKNOWN: {
            label: 'Not sure if posted',
            tone: 'neutral',
         },
         FAILED: {
            label: 'Not posted',
            tone: 'failure',
         },
         NO_COMPOSER: {
            label: 'Cannot post here',
            tone: 'failure',
         },
         WRONG_AUDIENCE: {
            label: 'Another audience',
            tone: 'failure',
         },
         WRONG_COMMENTS: {
            label: 'Other comment setting',
            tone: 'failure',
         },
         SIGNED_OUT: {
            label: 'Signed out',
            tone: 'failure',
         },
         ERROR: {
            label: 'The post could not be made',
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
      // The run is kept so a post that cannot be told as made or not can be looked at.
      recording: { always: true },
      run: async (context, input) => {
         // A failure is an answer, not a crash: a crash is run again, and a post must not be.
         try {
            return answerFor(await sendPost(context, baseUrl, input))
         } catch (error) {
            context.warn(describeError(error, 'The post could not be made'))

            return {
               status: 'FAILED',
               verdict: 'ERROR',
               message: 'The post could not be made.',
            }
         }
      },
   })
