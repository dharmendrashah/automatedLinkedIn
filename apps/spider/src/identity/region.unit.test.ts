import { describe, expect, it } from 'vitest'

import { type DeviceIdentity } from './deviceIdentity'
import { type ExitRegion, regionToKeep } from './region'

const device = {
   version: 1,
   os: 'windows',
   createdAt: '2026-10-15T10:00:00.000Z',
} as DeviceIdentity

const exit: ExitRegion = {
   ip: '203.0.113.7',
   country: 'DE',
   locale: 'de-DE',
   timezone: 'Europe/Berlin',
}

describe('regionToKeep', () => {
   it('should take the language and timezone of the exit for a device that has none yet', () => {
      expect(regionToKeep(device, exit)).toEqual({
         locale: 'de-DE',
         timezone: 'Europe/Berlin',
         country: 'DE',
      })
   })

   it('should change nothing while the proxy exits where it did', () => {
      expect(
         regionToKeep(
            {
               ...device,
               locale: 'de-DE',
               timezone: 'Europe/Berlin',
               country: 'DE',
            },
            exit
         )
      ).toBeUndefined()
   })

   it('should correct a language stored from the old random draw to the main language of the country', () => {
      expect(
         regionToKeep(
            {
               ...device,
               locale: 'es-US',
               timezone: 'America/Los_Angeles',
               country: 'US',
            },
            {
               ...exit,
               country: 'US',
               locale: 'en-US',
               timezone: 'America/Los_Angeles',
            }
         )
      ).toEqual({
         locale: 'en-US',
         timezone: 'America/Los_Angeles',
         country: 'US',
      })
   })

   it('should follow the exit to the new language and timezone when the country changes, and keep nothing else', () => {
      expect(
         regionToKeep(
            {
               ...device,
               locale: 'en-US',
               timezone: 'America/New_York',
               country: 'US',
            },
            exit
         )
      ).toEqual({
         locale: 'de-DE',
         timezone: 'Europe/Berlin',
         country: 'DE',
      })
   })
})
