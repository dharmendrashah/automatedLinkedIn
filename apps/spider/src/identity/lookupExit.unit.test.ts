import { beforeEach, describe, expect, it, vi } from 'vitest'

import { lookupExit } from './lookupExit'

const mocks = vi.hoisted(() => ({
   proxyExitGeo: vi.fn(),
   publicIP: vi.fn(),
   getGeolocation: vi.fn(),
   getUnicodeInfo: vi.fn(),
}))

vi.mock('camoufox/dist/ip.js', () => ({
   ProxyHelper: { asString: (proxy: { server: string }) => proxy.server },
   proxyExitGeo: mocks.proxyExitGeo,
   publicIP: mocks.publicIP,
}))
vi.mock('camoufox/dist/geolocation.js', () => ({ getGeolocation: mocks.getGeolocation }))
vi.mock('camoufox/dist/locales.js', async () => ({
   ...(await vi.importActual<Record<string, unknown>>('camoufox/dist/locales.js')),
   getUnicodeInfo: mocks.getUnicodeInfo,
}))

const territory = (type: string, languages: Array<[string, string]>) => ({
   $: { type },
   languagePopulation: languages.map(([language, populationPercent]) => ({
      $: {
         type: language,
         populationPercent,
      },
   })),
})

// Camoufox draws the language of a geoip lookup at random from these shares, so an account could get Spanish or German.
const territories = [
   territory('US', [
      ['es', '8.8'],
      ['en', '87.9'],
      ['de', '0.4'],
   ]),
   territory('DE', [
      ['en', '26'],
      ['de', '37'],
   ]),
   territory('CN', [
      ['zh_Hans', '90'],
      ['en', '1'],
   ]),
]

const drawn = (region: string, language: string) => ({
   locale: {
      region,
      asString: `${language}-${region}`,
   },
   timezone: 'America/Los_Angeles',
})

describe('lookupExit', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.getUnicodeInfo.mockResolvedValue(territories)
   })

   it('should give the language most people speak in the exit country, not the one Camoufox drew at random', async () => {
      mocks.proxyExitGeo.mockResolvedValue(['203.0.113.7', 'America/Los_Angeles'])
      mocks.getGeolocation.mockResolvedValue(drawn('US', 'de'))

      await expect(lookupExit({ server: 'http://proxy.example.net:80' })).resolves.toEqual({
         ip: '203.0.113.7',
         country: 'US',
         locale: 'en-US',
         timezone: 'America/Los_Angeles',
      })
   })

   it('should give each country its own main language', async () => {
      mocks.proxyExitGeo.mockResolvedValue(['203.0.113.8', 'Europe/Berlin'])
      mocks.getGeolocation.mockResolvedValue({
         ...drawn('DE', 'en'),
         timezone: 'Europe/Berlin',
      })

      await expect(lookupExit({ server: 'http://proxy.example.net:80' })).resolves.toMatchObject({
         country: 'DE',
         locale: 'de-DE',
      })
   })

   it('should drop the script a language comes with, as a browser reports it', async () => {
      mocks.proxyExitGeo.mockResolvedValue(['203.0.113.9', 'Asia/Shanghai'])
      mocks.getGeolocation.mockResolvedValue(drawn('CN', 'zh'))

      await expect(lookupExit({ server: 'http://proxy.example.net:80' })).resolves.toMatchObject({ locale: 'zh-CN' })
   })

   it('should keep the language Camoufox drew when it has no data for the country', async () => {
      mocks.proxyExitGeo.mockResolvedValue(['203.0.113.10', 'Pacific/Fiji'])
      mocks.getGeolocation.mockResolvedValue(drawn('FJ', 'fj'))

      await expect(lookupExit({ server: 'http://proxy.example.net:80' })).resolves.toMatchObject({ locale: 'fj-FJ' })
   })

   it('should ask for the address of this machine when there is no proxy', async () => {
      mocks.publicIP.mockResolvedValue('203.0.113.11')
      mocks.getGeolocation.mockResolvedValue(drawn('US', 'en'))

      await expect(lookupExit()).resolves.toMatchObject({ ip: '203.0.113.11' })
      expect(mocks.proxyExitGeo).not.toHaveBeenCalled()
   })
})
