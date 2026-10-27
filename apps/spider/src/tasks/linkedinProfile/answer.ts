import { type TaskOutcome } from '../defineTask'
import { type ProfileRead } from './read'

// What the reading of the profile tells the owner: fixed sentences and counts of what was read, never a name or a word of the profile,
// and which sections are not read yet (they were not seen filled in on a real profile, so no reader exists for them).
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
                     value: 'Endorsements, pending recommendations',
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
