import { type TaskOutcome } from '../defineTask'
import { type ProfileCapture } from './capture'
import { type ProfileRead } from './read'

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

// What the reading of the profile tells the owner: counts of what was read, and which sections are not read yet (they were not seen
// filled in on a real profile, so no reader exists for them).
export const answerForRead = ({ outcome, counts, dropped }: ProfileRead): TaskOutcome => {
   if (outcome === 'SIGNED_OUT') {
      return {
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
         message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
      }
   }

   if (outcome === 'NOT_OPENED') {
      return {
         status: 'FAILED',
         verdict: 'ERROR',
         message: 'The profile of the account could not be opened.',
      }
   }

   if (outcome === 'INVALID') {
      return {
         status: 'FAILED',
         verdict: 'ERROR',
         message: 'The profile was read but could not be put into the file.',
      }
   }

   return {
      status: 'SUCCEEDED',
      verdict: outcome,
      message:
         outcome === 'DONE' ? 'Read the profile.' : 'Read part of the profile; some pages did not open or did not fit.',
      commitSession: true,
      report: {
         headline: 'Read the profile.',
         sections: [
            {
               title: 'Read',
               items: counts.map(({ label, count }) => ({
                  label,
                  value: String(count),
               })),
            },
            {
               title: 'Not read yet',
               items: [
                  {
                     label: 'Sections',
                     value: 'Top skills, endorsements, pending recommendations',
                  },
                  ...(dropped > 0
                     ? [
                          {
                             label: 'Left out because they did not fit',
                             value: String(dropped),
                          },
                       ]
                     : []),
               ],
            },
         ],
      },
   }
}
