import { type TaskOutcome } from '../defineTask'
import { type ViewOutcome } from './view'

// What the owner is told of a visit: fixed sentences, never a name or a word of the profile.
export const answerFor = (outcome: ViewOutcome): TaskOutcome => {
   if (outcome === 'SIGNED_OUT') {
      return {
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
         message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
      }
   }

   if (outcome === 'NOT_AVAILABLE') {
      return {
         status: 'FAILED',
         verdict: 'NOT_AVAILABLE',
         message: 'The page was not a profile that could be viewed.',
      }
   }

   return {
      status: 'SUCCEEDED',
      verdict: 'DONE',
      message: 'Viewed the profile.',
      commitSession: true,
   }
}
