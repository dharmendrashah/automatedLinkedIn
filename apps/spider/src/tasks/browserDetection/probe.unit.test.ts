import { describe, expect, it } from 'vitest'

import { type ProbeFacts, type ProbeReading } from '../../scraping/driver'
import { readProbe } from './probe'

const facts: ProbeFacts = {
   userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0',
   platform: 'Win32',
   language: 'en-US',
   languages: 'en-US,en',
   timezone: 'Europe/Berlin',
   hardwareConcurrency: 8,
   webdriver: false,
}

const reading = (patch: Partial<ProbeReading> = {}): ProbeReading => ({
   window: facts,
   iframe: facts,
   worker: facts,
   ...patch,
})

const flagged = (probe: ProbeReading) =>
   readProbe(probe)
      .signals.filter(signal => signal.flagged)
      .map(signal => signal.name)

describe('readProbe', () => {
   it('should take a browser that tells the same story everywhere for a person', () => {
      const result = readProbe(reading())

      expect(result.verdict).toBe('HUMAN')
      expect(result.signals.every(signal => !signal.flagged)).toBe(true)
      expect(result.signals.length).toBeGreaterThan(5)
   })

   it('should flag a browser that says it is automated', () => {
      expect(
         flagged(
            reading({
               window: {
                  ...facts,
                  webdriver: true,
               },
            })
         )
      ).toContain('Says it is automated (navigator.webdriver)')
   })

   it.each([
      ['userAgent', 'Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0'],
      ['platform', 'Linux x86_64'],
      ['language', 'de-DE'],
      ['languages', 'de-DE,de'],
      ['timezone', 'America/New_York'],
      ['hardwareConcurrency', 2],
   ])('should flag a worker that does not share the %s of the page', (field, value) => {
      const result = readProbe(
         reading({
            worker: {
               ...facts,
               [field]: value,
            },
         })
      )

      expect(result.verdict).toBe('BOT')
      expect(result.signals.filter(signal => signal.flagged)).toHaveLength(1)
   })

   it('should flag an iframe that does not share the language of the page', () => {
      expect(
         readProbe(
            reading({
               iframe: {
                  ...facts,
                  language: 'fr-FR',
               },
            })
         ).verdict
      ).toBe('BOT')
   })

   it('should not call a browser a bot because a world could not be read, and say it could not tell', () => {
      const result = readProbe(reading({ worker: undefined }))

      expect(result.verdict).toBe('UNKNOWN')
      expect(result.signals.some(signal => signal.flagged)).toBe(false)
   })

   it('should still flag a disagreement it can see when another world could not be read', () => {
      expect(
         readProbe(
            reading({
               worker: undefined,
               iframe: {
                  ...facts,
                  timezone: 'Asia/Tokyo',
               },
            })
         ).verdict
      ).toBe('BOT')
   })
})
