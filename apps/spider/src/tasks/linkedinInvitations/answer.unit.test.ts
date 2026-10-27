import { describe, expect, it } from 'vitest'

import { answerFor } from './answer'

describe('answerFor', () => {
   it('should keep the session and report what was read and answered when it all went', () => {
      expect(
         answerFor({
            outcome: 'DONE',
            read: 5,
            asked: 2,
            answered: 2,
         })
      ).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'DONE',
         commitSession: true,
         report: { headline: 'Read 5 connection requests and answered 2 of 2 requests.' },
      })
   })

   it('should say only what was read when nothing was asked, in the singular for one', () => {
      expect(
         answerFor({
            outcome: 'DONE',
            read: 1,
            asked: 0,
            answered: 0,
         }).report?.headline
      ).toBe('Read 1 connection request.')
   })

   it('should call a read that did not do everything partial, and still succeed', () => {
      expect(
         answerFor({
            outcome: 'PARTIAL',
            read: 3,
            asked: 2,
            answered: 1,
         })
      ).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'PARTIAL',
      })
   })

   it('should fail, with fixed sentences and no session kept, for an answer that may have taken, a sign-in and a page that drew nothing', () => {
      const unknown = answerFor({
         outcome: 'UNKNOWN',
         read: 3,
         asked: 1,
         answered: 0,
      })

      expect(unknown).toMatchObject({
         status: 'FAILED',
         verdict: 'UNKNOWN',
      })
      expect(unknown.commitSession).toBeUndefined()
      expect(answerFor({ outcome: 'SIGNED_OUT' })).toMatchObject({
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
      })
      expect(answerFor({ outcome: 'NOT_DRAWN' })).toMatchObject({
         status: 'FAILED',
         verdict: 'ERROR',
      })
   })
})
