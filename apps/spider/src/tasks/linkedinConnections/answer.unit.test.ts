import { describe, expect, it } from 'vitest'

import { answerFor } from './answer'

describe('answerFor', () => {
   it('should keep the session and say what was read, in the singular for one', () => {
      expect(
         answerFor({
            outcome: 'DONE',
            read: 115,
         })
      ).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'DONE',
         commitSession: true,
         report: { headline: 'Read 115 connections.' },
      })
      expect(
         answerFor({
            outcome: 'DONE',
            read: 1,
         }).report?.headline
      ).toBe('Read 1 connection.')
   })

   it('should say a connection was removed', () => {
      expect(
         answerFor({
            outcome: 'DONE',
            read: 40,
            removal: 'REMOVED',
         })
      ).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'DONE',
         message: 'Removed the connection.',
         commitSession: true,
      })
   })

   it('should call a run that did not do everything partial and still succeed, saying nothing was removed when it was not', () => {
      expect(
         answerFor({
            outcome: 'PARTIAL',
            read: 12,
         })
      ).toMatchObject({
         status: 'SUCCEEDED',
         verdict: 'PARTIAL',
      })

      for (const removal of ['GONE', 'NOT_CLICKED'] as const) {
         const answer = answerFor({
            outcome: 'PARTIAL',
            read: 12,
            removal,
         })

         expect(answer).toMatchObject({
            status: 'SUCCEEDED',
            verdict: 'PARTIAL',
         })
         expect(answer.message).toContain('nothing was removed')
      }
   })

   it('should fail, with fixed sentences and no session kept, for a removal that may have taken, a sign-in and a page that drew nothing', () => {
      const unknown = answerFor({
         outcome: 'UNKNOWN',
         read: 3,
         removal: 'UNSURE',
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
