import { describe, expect, it, vi } from 'vitest'

import { currentCorrelationId, isCorrelationId } from '@automatedLinkedIn/logger'

import { inCorrelation } from './correlation'

describe('inCorrelation', () => {
   it('should run the rest of the request inside the ID the caller sent when it is valid', () => {
      let seen: string | undefined
      const next = vi.fn(() => {
         seen = currentCorrelationId()
      })

      inCorrelation('abcdef12-3456', '10.0.0.1', next)

      expect(next).toHaveBeenCalledOnce()
      expect(seen).toBe('abcdef12-3456')
   })

   it('should replace an invalid ID with a new one and never keep the raw value', () => {
      let seen: string | undefined

      inCorrelation('not valid!', '10.0.0.1', () => {
         seen = currentCorrelationId()
      })

      expect(isCorrelationId(seen)).toBe(true)
      expect(seen).not.toBe('not valid!')
   })
})
