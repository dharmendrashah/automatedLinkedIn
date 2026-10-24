import { MESSAGES_FINISHED_LABEL, MESSAGES_NEXT_SKIP_LABEL } from '@automatedLinkedIn/contracts'

import { type TaskOutcome } from '../defineTask'
import { type MessagesRead } from './read'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// What the owner is told of a run: fixed sentences and counts, never a name or a word of a message.
export const answerFor = ({
   outcome,
   conversations,
   messages,
   next,
   unchanged,
   finished,
}: MessagesRead): TaskOutcome => {
   if (outcome === 'SIGNED_OUT') {
      return {
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
         message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
      }
   }

   // Nothing to read is an answer when the list was looked at: every row was known, or the list ended. A page that showed no list is not.
   const nothingNew = conversations === 0 && (finished || unchanged > 0)

   if (conversations === 0 && !nothingNew) {
      return {
         status: 'FAILED',
         verdict: 'ERROR',
         message: 'No conversation of the messages could be opened.',
      }
   }

   return {
      status: 'SUCCEEDED',
      verdict: outcome,
      message: nothingNew
         ? 'Nothing new to read.'
         : outcome === 'DONE'
           ? 'Read the messages.'
           : 'Read part of the messages; the rest is read in the next run.',
      commitSession: true,
      report: {
         headline: nothingNew
            ? 'Nothing new to read.'
            : `Read ${plural(conversations, 'conversation')} and ${plural(messages, 'message')}.`,
         sections: [
            {
               title: 'Messages',
               items: [
                  {
                     label: 'Conversations',
                     value: String(conversations),
                  },
                  {
                     label: 'Messages',
                     value: String(messages),
                  },
                  {
                     label: 'Left alone, nothing new in them',
                     value: String(unchanged),
                  },
                  {
                     label: MESSAGES_NEXT_SKIP_LABEL,
                     value: String(next),
                  },
                  {
                     label: MESSAGES_FINISHED_LABEL,
                     value: finished ? 'Yes' : 'No',
                  },
               ],
            },
         ],
      },
   }
}
