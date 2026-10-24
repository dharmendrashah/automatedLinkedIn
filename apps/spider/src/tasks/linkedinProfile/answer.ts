import { type TaskOutcome } from '../defineTask'
import { type ProfileCapture } from './capture'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// What the owner is told of a run: fixed sentences and counts, never a name or a word of the profile.
export const answerFor = ({ outcome, pages, missed }: ProfileCapture): TaskOutcome => {
   if (outcome === 'SIGNED_OUT') {
      return {
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
         message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
      }
   }

   if (outcome === 'NOT_OPENED' || pages === 0) {
      return {
         status: 'FAILED',
         verdict: 'ERROR',
         message: 'The profile of the account could not be opened.',
      }
   }

   return {
      status: 'SUCCEEDED',
      verdict: outcome,
      message:
         outcome === 'DONE'
            ? 'Kept the pages of the profile.'
            : 'Kept part of the pages of the profile; some did not open.',
      commitSession: true,
      report: {
         headline: `Kept ${plural(pages, 'page')} of the profile.`,
         sections: [
            {
               title: 'Pages',
               items: [
                  {
                     label: 'Kept',
                     value: String(pages),
                  },
                  {
                     label: 'Not kept',
                     value: String(missed),
                  },
               ],
            },
         ],
      },
   }
}
