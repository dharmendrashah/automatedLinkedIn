import { describe, expect, it } from 'vitest'

import { stepLabel } from './types'

describe('stepLabel', () => {
   it('should say which try a step that a Retry ran again is on', () => {
      expect(
         stepLabel({
            status: 'DONE',
            progress: null,
            tries: 0,
         })
      ).toBe('Done')
      expect(
         stepLabel({
            status: 'DONE',
            progress: null,
            tries: 1,
         })
      ).toBe('Done (try 2)')
      expect(
         stepLabel({
            status: 'WAITING',
            progress: null,
            tries: 2,
         })
      ).toBe('Waiting (try 3)')
   })
})
