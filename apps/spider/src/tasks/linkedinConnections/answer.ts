import { type TaskOutcome } from '../defineTask'
import { type ConnectionsResult } from './run'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// What the owner is told of a run: fixed sentences and counts, never a name or a headline.
export const answerFor = (result: ConnectionsResult): TaskOutcome => {
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
            message: 'LinkedIn showed no connections and did not say that there are none.',
         }
      case 'UNKNOWN':
         return {
            status: 'FAILED',
            verdict: 'UNKNOWN',
            message: 'LinkedIn did not show whether the removal took. Read the connections again to check.',
         }
      default: {
         const read = `Read ${plural(result.read, 'connection')}`

         if (result.removal === 'REMOVED') {
            return {
               status: 'SUCCEEDED',
               verdict: result.outcome,
               message: 'Removed the connection.',
               commitSession: true,
               report: {
                  headline: 'Removed one connection.',
                  sections: [],
               },
            }
         }

         const removal =
            result.removal === 'GONE'
               ? ' The connection was no longer on the list, so nothing was removed.'
               : result.removal === 'NOT_CLICKED'
                 ? ' LinkedIn did not show the steps of a removal as expected, so nothing was removed.'
                 : ''

         return {
            status: 'SUCCEEDED',
            verdict: result.outcome,
            message:
               result.outcome === 'DONE'
                  ? 'Read the connections.'
                  : `Read the connections, but not everything was done.${removal}`,
            commitSession: true,
            report: {
               headline: `${read}.${removal}`,
               sections: [],
            },
         }
      }
   }
}
