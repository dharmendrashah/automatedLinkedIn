import { type TaskOutcome } from '../defineTask'
import { type ReplyResult } from './send'

// What the owner is told of a run: fixed sentences, never a name or a word of the message.
export const answerFor = (result: ReplyResult): TaskOutcome => {
   switch (result.outcome) {
      case 'SENT':
         return {
            status: 'SUCCEEDED',
            verdict: 'SENT',
            message: 'The reply was sent.',
            commitSession: true,
            report: {
               headline: 'The reply was sent.',
               sections: [],
            },
         }
      case 'UNKNOWN':
         return {
            status: 'FAILED',
            verdict: 'UNKNOWN',
            message: 'LinkedIn did not show whether the reply was sent. Check the conversation on LinkedIn.',
         }
      case 'NO_COMPOSER':
         return {
            status: 'FAILED',
            verdict: 'NO_COMPOSER',
            message: 'LinkedIn offers no place to reply in this conversation.',
         }
      case 'WRONG_THREAD':
         return {
            status: 'FAILED',
            verdict: 'WRONG_THREAD',
            message: 'LinkedIn opened another conversation, so nothing was typed.',
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
               TYPING: 'The words could not be typed into the box, so nothing was sent.',
               SEND_DISABLED: 'The send button was not available, so nothing was sent.',
               NOT_SENT: 'LinkedIn did not send the reply.',
            }[result.why],
         }
   }
}
