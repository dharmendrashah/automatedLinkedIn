import { describe, expect, it } from 'vitest'

import { answerFor } from './answer'

describe('answerFor', () => {
   it('should fail a run in which nothing was sent or withdrawn, with the count and without handing the session on', () => {
      expect(
         answerFor({
            outcome: 'NONE_SENT',
            sent: [
               {
                  id: 'a',
                  outcome: 'NO_CONNECT',
               },
            ],
            withdrawn: [],
         })
      ).toEqual({
         status: 'FAILED',
         verdict: 'NONE_SENT',
         message: 'Nothing was sent or withdrawn; each says why.',
         report: {
            headline: '0 of 1 invites sent, 0 of 0 withdrawn.',
            sections: [],
         },
      })
   })
})
