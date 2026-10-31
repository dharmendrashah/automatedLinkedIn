import { describe, expect, it } from 'vitest'

import { PRICE_MICROS } from '@automatedLinkedIn/contracts'

import { COMPANY_READ_MICROS, isRecent, readCostLine, readResultLine } from './read-cost'

describe('read-cost', () => {
   it('should keep the price equal to the contract', () => {
      expect(COMPANY_READ_MICROS).toBe(PRICE_MICROS.companyPage)
   })

   it('should price only the reads that will be charged and say how many are skipped', () => {
      expect(readCostLine(300, 12)).toBe(
         'About $1.20 for 300 companies. 12 companies read in the last 30 days are skipped.'
      )
      expect(readCostLine(1, 0)).toBe('About $0.004 for 1 company.')
   })

   it('should tell a read in the last 30 days from an older or missing one', () => {
      const now = Date.parse('2026-11-01T00:00:00Z')

      expect(isRecent('2026-10-10T00:00:00Z', now)).toBe(true)
      expect(isRecent('2026-09-01T00:00:00Z', now)).toBe(false)
      expect(isRecent(null, now)).toBe(false)
   })

   it('should split what was read, skipped and refused', () => {
      expect(
         readResultLine({
            reading: 34,
            readRecently: 3,
            paused: 1,
         })
      ).toBe(
         'Reading 34 companies; they fill in over the next minutes. 3 companies read in the last 30 days skipped. 1 company could not start now (reads are paused for a short while); try again later.'
      )
      expect(
         readResultLine({
            reading: 0,
            readRecently: 0,
            paused: 0,
         })
      ).toBe('Nothing to read.')
   })
})
