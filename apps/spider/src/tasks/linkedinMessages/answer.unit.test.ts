import { describe, expect, it } from 'vitest'

import { MESSAGES_FINISHED_LABEL, MESSAGES_NEXT_SKIP_LABEL } from '@automatedLinkedIn/contracts'

import { answerFor } from './answer'
import { type MessagesRead } from './read'

const read = (over: Partial<MessagesRead>): MessagesRead => ({
   outcome: 'DONE',
   conversations: 1,
   messages: 1,
   next: 1,
   unchanged: 0,
   finished: false,
   ...over,
})

describe('answerFor', () => {
   it('should say what was read, with counts only, and keep the session when everything was read', () => {
      const answer = answerFor(
         read({
            conversations: 12,
            messages: 340,
            next: 12,
         })
      )

      expect(answer).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'DONE',
         commitSession: true,
      })
      expect(answer.report?.headline).toBe('Read 12 conversations and 340 messages.')
      expect(JSON.stringify(answer.report)).not.toMatch(/[A-Za-z]+ [A-Z][a-z]+ [A-Z]/)
   })

   it('should say a run that read part succeeded, and where to go on from', () => {
      // 30 read from the place 20, with one that failed on the way: the place to go on from is after the last one read.
      const answer = answerFor(
         read({
            outcome: 'PARTIAL',
            conversations: 30,
            messages: 900,
            next: 51,
         })
      )

      expect(answer).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'PARTIAL',
         commitSession: true,
      })
      expect(answer.report?.sections[0]?.items).toContainEqual({
         label: MESSAGES_NEXT_SKIP_LABEL,
         value: '51',
      })
      expect(answer.report?.sections[0]?.items).toContainEqual({
         label: MESSAGES_FINISHED_LABEL,
         value: 'No',
      })
   })

   it('should answer nothing new as a success when the list was looked at, and fail when it was not', () => {
      const known = answerFor(
         read({
            conversations: 0,
            messages: 0,
            next: 3,
            unchanged: 3,
            finished: true,
         })
      )

      expect(known).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'DONE',
         message: 'Nothing new to read.',
      })
      expect(known.report?.sections[0]?.items).toContainEqual({
         label: MESSAGES_FINISHED_LABEL,
         value: 'Yes',
      })
      expect(
         answerFor(
            read({
               conversations: 0,
               messages: 0,
               next: 50,
               finished: true,
            })
         )
      ).toMatchObject({ status: 'SUCCEEDED' })
   })

   it('should fail a run that read nothing, and sign-out is its own verdict', () => {
      expect(
         answerFor(
            read({
               outcome: 'PARTIAL',
               conversations: 0,
               messages: 0,
               next: 0,
            })
         )
      ).toMatchObject({
         status: 'FAILED',
         verdict: 'ERROR',
      })
      expect(
         answerFor(
            read({
               outcome: 'SIGNED_OUT',
               conversations: 3,
               messages: 40,
               next: 3,
            })
         )
      ).toMatchObject({
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
      })
   })

   it('should say one conversation and one message in the singular', () => {
      expect(answerFor(read({})).report?.headline).toBe('Read 1 conversation and 1 message.')
   })
})
