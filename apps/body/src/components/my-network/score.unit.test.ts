import { describe, expect, it } from 'vitest'

import { SCORE_BANDS as CONTRACT_BANDS, SCORE_BAND_FROM, scoreBandOf as contractBandOf } from '@automatedLinkedIn/contracts'

import { SCORE_BANDS, SCORE_NAMES, SCORE_WORDS, scoreBandOf, scoreLabel } from './score'

describe('score label of the bar', () => {
   it('reads the score, out of 100, with its band', () => {
      expect(scoreLabel(39)).toBe('Score 39 of 100, Red')
      expect(scoreLabel(40)).toBe('Score 40 of 100, Yellow')
      expect(scoreLabel(100)).toBe('Score 100 of 100, Green')
   })

   it('says so when a person has no score', () => {
      expect(scoreLabel(null)).toBe('No score')
   })
})

describe('score bands on the page', () => {
   it('puts red below 40, yellow from 40 to 69, and green from 70', () => {
      expect([0, 39, 40, 69, 70, 100].map(scoreBandOf)).toEqual(['RED', 'RED', 'YELLOW', 'YELLOW', 'GREEN', 'GREEN'])
   })

   it('agrees with the contract on every score', () => {
      for (let score = 0; score <= 100; score += 1) {
         expect(scoreBandOf(score)).toBe(contractBandOf(score))
      }

      expect(SCORE_BANDS).toEqual(CONTRACT_BANDS)
      expect(SCORE_BAND_FROM).toEqual({ YELLOW: 40, GREEN: 70 })
   })

   it('names the bands in words, and in one word on a chip', () => {
      expect(SCORE_WORDS).toEqual({
         RED: 'Red, under 40',
         YELLOW: 'Yellow, 40 to 69',
         GREEN: 'Green, 70 and up',
      })
      expect(SCORE_NAMES).toEqual({ RED: 'Red', YELLOW: 'Yellow', GREEN: 'Green' })
   })
})
