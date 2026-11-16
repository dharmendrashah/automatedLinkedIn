import { describe, expect, it } from 'vitest'

import { isUnbatched } from './unbatched'

describe('isUnbatched', () => {
   it('should be true only for skipBatch: true', () => {
      expect(isUnbatched({ context: { skipBatch: true } })).toBe(true)
   })

   it.each([{}, { skipBatch: false }, { skipBatch: 'true' }, { skipBatch: 1 }, { other: true }])(
      'should be false for %j',
      context => {
         expect(isUnbatched({ context })).toBe(false)
      }
   )
})
