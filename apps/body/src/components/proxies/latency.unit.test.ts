import { describe, expect, it } from 'vitest'

import { describeLatency } from './latency'

describe('describeLatency', () => {
   it.each([
      [0, 'fast'],
      [499, 'fast'],
      [500, 'ok'],
      [1499, 'ok'],
      [1500, 'slow'],
      [9999, 'slow'],
   ])('should call %i ms %s', (ms, speed) => {
      expect(describeLatency(ms)?.speed).toBe(speed)
   })

   it('should show the number of milliseconds as the text', () => {
      expect(describeLatency(342)?.text).toBe('342 ms')
   })

   it('should show nothing for a proxy that has not been reached', () => {
      expect(describeLatency(null)).toBeNull()
   })
})
