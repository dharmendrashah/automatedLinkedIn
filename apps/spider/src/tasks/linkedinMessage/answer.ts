import { type TaskOutcome } from '../defineTask'
import { type MessageResult } from './send'

// What the owner is told of a run: fixed sentences, never a name or a word of the message.
export const answerFor = (result: MessageResult): TaskOutcome => {
   switch (result.outcome) {
      case 'SENT':
         return {
            status: 'SUCCEEDED',
            verdict: 'SENT',
            message: 'The message was sent.',
            commitSession: true,
            report: {
               headline: 'The message was sent.',
               sections: [],
            },
         }
      case 'UNKNOWN':
         return {
            status: 'FAILED',
            verdict: 'UNKNOWN',
            message: 'LinkedIn did not show whether the message was sent. Check the conversation on LinkedIn.',
         }
      case 'NO_MESSAGE_BUTTON':
         return {
            status: 'FAILED',
            verdict: 'NO_MESSAGE_BUTTON',
            message:
               'The profile shows no Message button, so nothing was typed. The person may no longer be a connection.',
         }
      case 'NO_COMPOSER':
         return {
            status: 'FAILED',
            verdict: 'NO_COMPOSER',
            message: 'LinkedIn did not open a place to write, so nothing was typed.',
         }
      case 'WRONG_RECIPIENT':
         return {
            status: 'FAILED',
            verdict: 'WRONG_RECIPIENT',
            message: 'LinkedIn opened a conversation with someone else, so nothing was typed.',
         }
      case 'NOT_AVAILABLE':
         return {
            status: 'FAILED',
            verdict: 'NOT_AVAILABLE',
            message: 'The profile could not be opened, so nothing was typed.',
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
               SEND_NOT_CLICKED: 'The send button could not be clicked, so nothing was sent.',
               NOT_SENT: 'LinkedIn did not send the message.',
            }[result.why],
         }
   }
}
