import { describe, expect, it } from 'vitest'

import { backfillText, formatPipelineUsd, formulaText, parseWorth, sourceLine } from './pipeline-format'

describe('pipeline text', () => {
   it('writes the sum of the example in the request', () => {
      expect(formatPipelineUsd(12_000)).toBe('$12,000')
      expect(formulaText(10, 100)).toBe('10 positive replies x $100 a month x 12')
      expect(formulaText(1, 100)).toBe('1 positive reply x $100 a month x 12')
   })

   it('says where the replies came from, leaving out what is zero', () => {
      expect(sourceLine({ rules: 3, ai: 2, marked: 5 })).toBe('3 detected by rules, 2 detected by AI, 5 marked by you')
      expect(sourceLine({ rules: 0, ai: 0, marked: 1 })).toBe('1 marked by you')
   })
})

describe('parseWorth', () => {
   it('takes a whole number of dollars, with or without a dollar sign and commas', () => {
      expect(parseWorth('100')).toBe(100)
      expect(parseWorth('$1,500')).toBe(1500)
   })

   it('clears on an empty field, and refuses a fraction, zero, a word or too much', () => {
      expect(parseWorth('  ')).toBeNull()
      expect(parseWorth('12.5')).toBe('invalid')
      expect(parseWorth('0')).toBe('invalid')
      expect(parseWorth('lots')).toBe('invalid')
      expect(parseWorth('99999999')).toBe('invalid')
   })
})

describe('backfillText', () => {
   it('tells what was counted, what waits for the AI, and what was left alone', () => {
      expect(
         backfillText({ counted: 3, queued: 12, alreadyKnown: 0, noCampaign: 2, leftForNextPress: 5, aiOff: false })
      ).toBe(
         'Counted 3 positive replies. 12 unclear replies are being read by the AI in the background. 5 more wait for the next press. 2 people are in no campaign, so nothing was counted for them.'
      )
      expect(
         backfillText({ counted: 0, queued: 0, alreadyKnown: 4, noCampaign: 0, leftForNextPress: 0, aiOff: true })
      ).toBe(
         'No new positive reply was found by the rules. AI reading is switched off, so unclear replies were left alone.'
      )
   })
})
