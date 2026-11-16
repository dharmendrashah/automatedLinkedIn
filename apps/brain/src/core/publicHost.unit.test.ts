import { type lookup } from 'node:dns'
import { describe, expect, it } from 'vitest'

import { isPublicHost } from './publicHost'

// The injected lookup answers with the given addresses, or fails when none are given.
const resolving = (...addresses: string[]): typeof lookup =>
   ((_host: string, _options: unknown, callback: (error: Error | null, found?: { address: string }[]) => void) => {
      if (addresses.length === 0) {
         callback(new Error('ENOTFOUND'))

         return
      }

      callback(
         null,
         addresses.map(address => ({ address }))
      )
   }) as unknown as typeof lookup

describe('isPublicHost', () => {
   it('should allow a literal public address', async () => {
      await expect(isPublicHost('93.184.216.34')).resolves.toBe(true)
   })

   it.each(['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.5', '[::1]'])(
      'should refuse the literal address %s',
      async host => {
         await expect(isPublicHost(host)).resolves.toBe(false)
      }
   )

   it('should allow a name that resolves only to public addresses', async () => {
      await expect(isPublicHost('proxy.example.net', resolving('93.184.216.34', '8.8.8.8'))).resolves.toBe(true)
   })

   it('should refuse a name when any of its addresses is private', async () => {
      await expect(isPublicHost('proxy.example.net', resolving('93.184.216.34', '10.0.0.5'))).resolves.toBe(false)
   })

   it('should let a name that does not resolve through, because connecting to it fails by itself', async () => {
      await expect(isPublicHost('nowhere.invalid', resolving())).resolves.toBe(true)
   })
})
