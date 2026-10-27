import { type TaskOutcome } from '../defineTask'
import { type InvitationsResult } from './run'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// What the owner is told of a run: fixed sentences and counts, never a name, a headline or a word a sender wrote.
export const answerFor = (result: InvitationsResult): TaskOutcome => {
   switch (result.outcome) {
      case 'SIGNED_OUT':
         return {
            status: 'FAILED',
            verdict: 'SIGNED_OUT',
            message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
         }
      case 'NOT_DRAWN':
         return {
            status: 'FAILED',
            verdict: 'ERROR',
            message: 'LinkedIn showed no connection requests and did not say that there are none.',
         }
      case 'UNKNOWN':
         return {
            status: 'FAILED',
            verdict: 'UNKNOWN',
            message: 'LinkedIn did not show whether an answer took. Read the requests again to check.',
         }
      default: {
         const answers =
            result.asked > 0 ? ` and answered ${result.answered} of ${plural(result.asked, 'request')}` : ''
         const done = result.outcome === 'DONE'

         return {
            status: 'SUCCEEDED',
            verdict: result.outcome,
            message: done
               ? 'Read the connection requests.'
               : 'Read the connection requests, but not everything was done.',
            commitSession: true,
            report: {
               headline: `Read ${plural(result.read, 'connection request')}${answers}.`,
               sections: [],
            },
         }
      }
   }
}
