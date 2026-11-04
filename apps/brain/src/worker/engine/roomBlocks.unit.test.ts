import { describe, expect, it } from 'vitest'

import { extraSeconds } from './personWaitRules'

describe('the random extra of Wait per person', () => {
   it('should be the same for a person and a block every time', () => {
      expect(extraSeconds('ada', 'wait', 3600)).toBe(extraSeconds('ada', 'wait', 3600))
   })

   it('should stay between 0 and the most asked for, and differ from person to person', () => {
      const extras = Array.from({ length: 50 }, (_, index) => extraSeconds(`person${index}`, 'wait', 3600))

      expect(extras.every(extra => extra >= 0 && extra <= 3600)).toBe(true)
      expect(new Set(extras).size).toBeGreaterThan(10)
   })

   it('should be 0 when no extra is asked for', () => {
      expect(extraSeconds('ada', 'wait', 0)).toBe(0)
   })
})
