import { describe, expect, it } from 'vitest'

import { answerFor } from './answer'

describe('answerFor', () => {
   it('should say a viewed profile succeeded, with one fixed sentence and nothing of the profile', () => {
      expect(answerFor('DONE')).toEqual({
         status: 'SUCCEEDED',
         verdict: 'DONE',
         message: 'Viewed the profile.',
         commitSession: true,
      })
   })

   it('should say a profile that is gone or hidden failed without being an error of the account', () => {
      expect(answerFor('NOT_AVAILABLE')).toEqual({
         status: 'FAILED',
         verdict: 'NOT_AVAILABLE',
         message: 'The page was not a profile that could be viewed.',
      })
   })

   it('should say signed out, so the sign-in check runs next', () => {
      expect(answerFor('SIGNED_OUT')).toMatchObject({
         status: 'FAILED',
         verdict: 'SIGNED_OUT',
      })
   })
})
