import { type TaskOutcome } from '../defineTask'
import { type MessagesRead } from './read'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

// What the owner is told of a run: fixed sentences and counts, never a name or a word of a message.
export const answerFor = ({ outcome, conversations, messages }: MessagesRead, skip: number): TaskOutcome => {
   if (outcome === 'SIGNED_OUT') {
      return {
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
         message: 'LinkedIn asked for a sign-in, so the sign-in check runs next.',
      }
   }

   if (conversations === 0) {
      return {
         status: 'FAILED',
         verdict: 'ERROR',
         message: 'No conversation of the messages could be opened.',
      }
   }

   return {
      status: 'SUCCEEDED',
      verdict: outcome,
      message: outcome === 'DONE' ? 'Read the messages.' : 'Read part of the messages; run again to go on.',
      commitSession: true,
      report: {
         headline: `Read ${plural(conversations, 'conversation')} and ${plural(messages, 'message')}.`,
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
                     label: 'To read the next ones, set skip to',
                     value: String(skip + conversations),
                  },
               ],
            },
         ],
      },
   }
}
