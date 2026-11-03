import { type TaskOutcome } from '../defineTask'
import { type InmailResult } from './send'

// What the owner is told of a run: fixed sentences, never a name, a subject or a word of the message.
export const answerFor = (result: InmailResult): TaskOutcome => {
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
            message: 'The profile shows no Message button, so nothing was typed.',
         }
      case 'NOT_INMAIL':
         return {
            status: 'FAILED',
            verdict: 'NOT_INMAIL',
            message:
               'LinkedIn opened an ordinary conversation, not a message to a member who is not a connection, so nothing was typed.',
         }
      case 'WOULD_COST_CREDIT':
         return {
            status: 'FAILED',
            verdict: 'WOULD_COST_CREDIT',
            message: 'LinkedIn does not say this message is free, so nothing was typed.',
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
            message: 'LinkedIn opened a message for someone else, so nothing was typed.',
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
               SUBJECT: 'The subject could not be typed, so nothing was sent.',
               NO_FILES: 'The files could not be fetched, so nothing was sent.',
               ATTACH: 'LinkedIn offered no place to attach the files, so nothing was sent.',
               UPLOAD: 'The files did not finish uploading in LinkedIn, so nothing was sent.',
               SEND_DISABLED: 'The send button was not available, so nothing was sent.',
               SEND_NOT_CLICKED: 'The send button could not be clicked, so nothing was sent.',
               NOT_SENT: 'LinkedIn did not send the message.',
            }[result.why],
         }
   }
}
