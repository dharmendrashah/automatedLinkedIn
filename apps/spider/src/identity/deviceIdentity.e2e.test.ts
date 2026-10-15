import { describe, expect, it } from 'vitest'

import { CamoufoxDriver } from '../scraping/camoufoxDriver'
import { createDeviceIdentity } from './createDeviceIdentity'

const driver = new CamoufoxDriver({
   actionTimeoutMs: 30_000,
   isAllowedNavigation: () => true,
})

const read = async (identity: Parameters<typeof driver.open>[0]) => {
   const session = await driver.open(identity)

   try {
      return {
         reported: await session.identity(),
         probe: await session.probe?.(),
      }
   } finally {
      await session.close()
   }
}

describe('the device of an account, in a real browser', () => {
   it('should look the same on every run, and keep the language and timezone it was given', async () => {
      const identity = {
         ...createDeviceIdentity(),
         locale: 'de-DE',
         timezone: 'Europe/Berlin',
      }

      const first = await read({ identity })
      const second = await read({ identity })
      const other = await read({ identity: createDeviceIdentity() })

      expect(second).toEqual(first)
      expect(first.probe?.window).toMatchObject({
         language: 'de-DE',
         timezone: 'Europe/Berlin',
      })
      // The worker and the iframe say the same as the page, which is what a bot test looks for.
      expect(first.probe?.worker).toMatchObject({
         language: 'de-DE',
         timezone: 'Europe/Berlin',
      })
      expect(first.probe?.iframe).toMatchObject({ timezone: 'Europe/Berlin' })
      expect(first.reported.userAgent).toMatch(/Windows/)
      // A different device is a different screen often enough to be worth knowing; the point is only that it is possible.
      expect(other.reported.screen).toMatch(/^\d+x\d+$/)
   })
})
