import { describe, expect, it } from 'vitest'

import { INVITATION_LIMITS } from '@automatedLinkedIn/contracts'

import { NETWORK_LIMITS, answersLeftToday, selectionCap } from './rules'

describe('limits', () => {
   it('should be the limits brain and the task use, from the contract', () => {
      expect(NETWORK_LIMITS).toMatchObject(INVITATION_LIMITS)
   })

   it('should hold the limits the owner chose', () => {
      expect(NETWORK_LIMITS).toMatchObject({
         perRun: 10,
         perDay: 50,
         gapSeconds: {
            min: 4,
            max: 9,
         },
      })
   })

   it('should count what is left of the day, never below zero', () => {
      expect(answersLeftToday(0)).toBe(50)
      expect(answersLeftToday(48)).toBe(2)
      expect(answersLeftToday(80)).toBe(0)
   })

   it('should let a run take 10, or what the day has left when that is less', () => {
      expect(selectionCap(0)).toBe(10)
      expect(selectionCap(40)).toBe(10)
      expect(selectionCap(45)).toBe(5)
      expect(selectionCap(50)).toBe(0)
   })
})
