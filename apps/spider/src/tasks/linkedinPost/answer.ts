import { type TaskOutcome } from '../defineTask'
import { type PostResult } from './post'

// What the owner is told of a run: fixed sentences, never a word of the post or anything the page showed.
export const answerFor = (result: PostResult): TaskOutcome => {
   switch (result.outcome) {
      case 'POSTED':
         return {
            status: 'SUCCEEDED',
            verdict: 'POSTED',
            message: 'The post is up.',
            commitSession: true,
            report: {
               headline: 'The post is up.',
               sections: [
                  {
                     title: 'Post',
                     items: [
                        {
                           label: 'Link',
                           value: result.link,
                           status: 'ok',
                        },
                     ],
                  },
               ],
            },
         }
      case 'POSTED_NO_LINK':
         return {
            status: 'SUCCEEDED',
            verdict: 'POSTED_NO_LINK',
            message: 'LinkedIn said the post went but gave no link. Find it in your activity on LinkedIn.',
            commitSession: true,
         }
      case 'UNKNOWN':
         return {
            status: 'FAILED',
            verdict: 'UNKNOWN',
            message: 'LinkedIn did not show whether the post went. Check your posts on LinkedIn before trying again.',
         }
      case 'NO_COMPOSER':
         return {
            status: 'FAILED',
            verdict: 'NO_COMPOSER',
            message: 'LinkedIn offers no place to write a post, so nothing was posted.',
         }
      case 'WRONG_AUDIENCE':
         return {
            status: 'FAILED',
            verdict: 'WRONG_AUDIENCE',
            message: 'The audience of the post could not be set to the one asked for, so nothing was posted.',
         }
      case 'WRONG_COMMENTS':
         return {
            status: 'FAILED',
            verdict: 'WRONG_COMMENTS',
            message: 'Who may comment could not be set to what was asked for, so nothing was posted.',
         }
      case 'SIGNED_OUT':
         return {
            status: 'FAILED',
            verdict: 'SIGNED_OUT',
            message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
         }
      case 'FAILED':
         return {
            status: 'FAILED',
            verdict: 'FAILED',
            message: {
               TYPING: 'The words could not be typed into the box, so nothing was posted.',
               POST_DISABLED: 'The Post button was not available, so nothing was posted.',
               POST_NOT_CLICKED: 'The Post button could not be clicked, so nothing was posted.',
               NO_FILES: 'The files could not be fetched, so nothing was posted.',
               ATTACH: 'LinkedIn offered no place to add the files, so nothing was posted.',
               UPLOAD: 'The files did not finish uploading in LinkedIn, so nothing was posted.',
               FILE_REFUSED: 'LinkedIn did not accept a file, so nothing was posted.',
            }[result.why],
         }
   }
}
