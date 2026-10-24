import { describe, expect, it } from 'vitest'

import { answerFor } from './answer'

describe('answerFor', () => {
   it('should say the pages were kept, with counts only, and keep the session', () => {
      const answer = answerFor({
         outcome: 'DONE',
         pages: 11,
         missed: 0,
      })

      expect(answer).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'DONE',
         commitSession: true,
      })
      expect(answer.report?.headline).toBe('Kept 11 pages of the profile.')
      expect(answer.report?.sections[0]?.items).toEqual([
         {
            label: 'Kept',
            value: '11',
         },
         {
            label: 'Not kept',
            value: '0',
         },
      ])
   })

   it('should say part was kept when some pages did not open', () => {
      expect(
         answerFor({
            outcome: 'PARTIAL',
            pages: 4,
            missed: 7,
         })
      ).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'PARTIAL',
      })
   })

   it('should fail a run that kept nothing, and sign-out is its own verdict', () => {
      expect(
         answerFor({
            outcome: 'NOT_OPENED',
            pages: 0,
            missed: 10,
         })
      ).toMatchObject({
         status: 'FAILED',
         verdict: 'ERROR',
      })
      expect(
         answerFor({
            outcome: 'SIGNED_OUT',
            pages: 3,
            missed: 7,
         })
      ).toMatchObject({
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
      })
   })

   it('should say one page in the singular', () => {
      expect(
         answerFor({
            outcome: 'PARTIAL',
            pages: 1,
            missed: 10,
         }).report?.headline
      ).toBe('Kept 1 page of the profile.')
   })
})
