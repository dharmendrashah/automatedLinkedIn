import { describe, expect, it } from 'vitest'

import { hostFontsFor, withUiFonts } from './hostFonts'

const chunked = (config: unknown) => {
   const text = JSON.stringify(config)

   return {
      CAMOU_CONFIG_2: text.slice(10),
      CAMOU_CONFIG_1: text.slice(0, 10),
      OTHER: 'x',
   }
}

describe('hostFontsFor', () => {
   it("lists the fonts a browser claiming the machine's own OS has, on macOS only", async () => {
      const resolve = async () => ({ env: chunked({ fonts: ['System Font', 'Helvetica Neue'] }) })

      expect(await hostFontsFor('darwin', resolve)).toEqual(['System Font', 'Helvetica Neue'])
      expect(await hostFontsFor('linux', resolve)).toEqual([])
      expect(await hostFontsFor('win32', resolve)).toEqual([])
   })
})

describe('withUiFonts', () => {
   const options = {
      headless: false,
      proxy: { server: 'http://p:1' },
      geoip: '1.2.3.4',
      locale: 'en-US',
   }

   it('keeps the fonts the identity claims and adds the host ones, once each', async () => {
      const seen: object[] = []
      const result = await withUiFonts(options, ['Helvetica Neue', 'Segoe UI'], async probe => {
         seen.push(probe)

         return { env: chunked({ fonts: ['Arial', 'Segoe UI'] }) }
      })

      expect(result).toEqual({
         ...options,
         fonts: ['Arial', 'Segoe UI', 'Helvetica Neue'],
      })
   })

   it('draws the list without the proxy lookup, which would only repeat the network call', async () => {
      const seen: Array<Record<string, unknown>> = []

      await withUiFonts(options, ['Helvetica Neue'], async probe => {
         seen.push(probe)

         return { env: chunked({ fonts: [] }) }
      })

      expect(seen[0]).not.toHaveProperty('proxy')
      expect(seen[0]).not.toHaveProperty('geoip')
      expect(seen[0]).toHaveProperty('locale', 'en-US')
   })

   it('leaves the options alone when there is nothing to add', async () => {
      expect(await withUiFonts(options, [], async () => ({ env: {} }))).toBe(options)
   })
})
