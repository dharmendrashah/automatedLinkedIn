import { type TaskOutcome } from '../defineTask'
import { DONE_OUTCOMES, type EngageRun } from './run'

// What the owner is told of a run: fixed sentences with counts only, never a word of a post or of a comment.
export const answerFor = ({ verdict, acts }: EngageRun): TaskOutcome => {
   if (verdict === 'SIGNED_OUT') {
      return {
         status: 'FAILED',
         verdict,
         message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
      }
   }

   if (verdict === 'RESTRICTED') {
      return {
         status: 'FAILED',
         verdict,
         message: 'LinkedIn restricted the account, so no more acts were made.',
      }
   }

   if (verdict === 'ERROR') {
      return {
         status: 'FAILED',
         verdict,
         message: 'The acts could not be finished.',
      }
   }

   if (verdict === 'NONE_DONE') {
      return {
         status: 'FAILED',
         verdict,
         message: 'None of the acts were done.',
      }
   }

   const done = acts.filter(({ outcome }) => DONE_OUTCOMES.includes(outcome)).length

   return {
      status: 'SUCCEEDED',
      verdict,
      message: `${done} of ${acts.length} acts done.`,
      commitSession: true,
   }
}
