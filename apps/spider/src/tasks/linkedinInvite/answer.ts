import { type TaskOutcome } from '../defineTask'
import { type InviteRun } from './run'

const counted = ({ sent, withdrawn }: InviteRun) => {
   const invited = sent.filter(({ outcome }) => outcome === 'SENT').length
   const taken = withdrawn.filter(({ outcome }) => outcome === 'WITHDRAWN').length

   return {
      headline: `${invited} of ${sent.length} invites sent, ${taken} of ${withdrawn.length} withdrawn.`,
      sections: [],
   }
}

// What the owner is told of a run: fixed sentences and counts, never a name or a word of a note.
export const answerFor = (run: InviteRun): TaskOutcome => {
   switch (run.outcome) {
      case 'DONE':
         return {
            status: 'SUCCEEDED',
            verdict: 'DONE',
            message: 'The invites were sent and withdrawn as asked.',
            commitSession: true,
            report: counted(run),
         }
      case 'PARTIAL':
         return {
            status: 'SUCCEEDED',
            verdict: 'PARTIAL',
            message: 'Some invites could not be sent or withdrawn; each says why.',
            commitSession: true,
            report: counted(run),
         }
      case 'UNKNOWN':
         return {
            status: 'FAILED',
            verdict: 'UNKNOWN',
            message: 'LinkedIn did not show whether an invite took. Nothing more was pressed.',
            report: counted(run),
         }
      case 'LIMIT_REACHED':
         return {
            status: 'FAILED',
            verdict: 'LIMIT_REACHED',
            message: 'LinkedIn said this account may not send more invites for now.',
            report: counted(run),
         }
      case 'RESTRICTED':
         return {
            status: 'FAILED',
            verdict: 'RESTRICTED',
            message: 'LinkedIn showed a restriction notice, so nothing more was pressed.',
         }
      case 'SIGNED_OUT':
         return {
            status: 'FAILED',
            verdict: 'SIGNED_OUT',
            message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
         }
   }
}
