import { describe, expect, it } from 'vitest'

import { lookupExit } from './lookupExit'

describe('lookupExit', () => {
   it('should say where this machine exits, in the country, language and timezone that address stands for', async () => {
      const exit = await lookupExit()

      expect(exit.ip).toMatch(/^[\d.:a-f]+$/i)
      expect(exit.country).toMatch(/^[A-Z]{2}$/)
      expect(exit.locale).toMatch(/^[a-z]{2,3}-[A-Z]{2}$/)
      expect(exit.timezone).toContain('/')
   })
})
