import { type IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import { CdnFetchError, type Get, isPublicAddress, openRemote, publicLookup } from './cdnFetch'

const answer = (statusCode: number, headers: Record<string, string> = {}) =>
   Object.assign(Readable.from([]), {
      statusCode,
      headers,
   }) as unknown as IncomingMessage

const reasonOf = async (promise: Promise<unknown>) => {
   const error: unknown = await promise.catch((caught: unknown) => caught)

   return error instanceof CdnFetchError ? error.reason : error
}

describe('isPublicAddress', () => {
   it.each(['8.8.8.8', '13.107.42.14', '2606:4700::1111'])('should allow %s', address => {
      expect(isPublicAddress(address)).toBe(true)
   })

   it.each([
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '255.255.255.255',
      '::1',
      '::',
      '::ffff:127.0.0.1',
      'fd00::1',
      'fe80::1',
      'not an address',
   ])('should refuse %s', address => {
      expect(isPublicAddress(address)).toBe(false)
   })
})

describe('publicLookup', () => {
   const lookupOf = (addresses: { address: string; family: number }[]) =>
      vi.fn((_host: string, _options: unknown, callback: (error: null, found: typeof addresses) => void) => {
         callback(null, addresses)
      })

   it('should hand over the addresses when every one is public', () => {
      const callback = vi.fn()

      publicLookup(
         lookupOf([
            {
               address: '8.8.8.8',
               family: 4,
            },
         ]) as never
      )('a.com', {}, callback)

      expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4)
   })

   it('should hand over all addresses when asked for all', () => {
      const callback = vi.fn()
      const addresses = [
         {
            address: '8.8.8.8',
            family: 4,
         },
      ]

      publicLookup(lookupOf(addresses) as never)('a.com', { all: true }, callback)

      expect(callback).toHaveBeenCalledWith(null, addresses)
   })

   it('should refuse a name with any private address', () => {
      const callback = vi.fn()

      publicLookup(
         lookupOf([
            {
               address: '8.8.8.8',
               family: 4,
            },
            {
               address: '10.0.0.1',
               family: 4,
            },
         ]) as never
      )('a.com', {}, callback)

      expect(callback).toHaveBeenCalledWith(new CdnFetchError('REFUSED'), [])
   })
})

describe('openRemote', () => {
   it('should follow a redirect to another public https address', async () => {
      const ok = answer(200, { 'content-type': 'image/png' })
      const get = vi
         .fn<Get>()
         .mockResolvedValueOnce(answer(302, { location: '/moved.png' }))
         .mockResolvedValueOnce(ok)

      const remote = await openRemote(new URL('https://a.com/x.png'), get)

      remote.finish()
      expect(remote.response).toBe(ok)
      expect(get.mock.calls[1]?.[0].href).toBe('https://a.com/moved.png')
   })

   it.each(['http://a.com/x', 'https://10.0.0.1/x', 'https://a.com:8080/x'])(
      'should refuse a redirect to %s',
      async location => {
         const get = vi.fn<Get>().mockResolvedValue(answer(301, { location }))

         expect(await reasonOf(openRemote(new URL('https://a.com/x'), get))).toBe('REFUSED')
      }
   )

   it('should stop after three redirects', async () => {
      const get = vi.fn<Get>().mockImplementation(async () => answer(302, { location: '/again' }))

      expect(await reasonOf(openRemote(new URL('https://a.com/x'), get))).toBe('BAD_GATEWAY')
      expect(get).toHaveBeenCalledTimes(4)
   })

   it.each([
      [404, 'NOT_FOUND'],
      [410, 'NOT_FOUND'],
      [403, 'BAD_GATEWAY'],
      [500, 'BAD_GATEWAY'],
   ])('should answer %i as %s', async (status, reason) => {
      const get = vi.fn<Get>().mockResolvedValue(answer(status))

      expect(await reasonOf(openRemote(new URL('https://a.com/x'), get))).toBe(reason)
   })

   it('should keep the reason of a refused connection', async () => {
      const get = vi.fn<Get>().mockRejectedValue(new CdnFetchError('REFUSED'))

      expect(await reasonOf(openRemote(new URL('https://a.com/x'), get))).toBe('REFUSED')
   })

   it('should answer a stopped fetch as a timeout', async () => {
      const get = vi.fn<Get>().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))

      expect(await reasonOf(openRemote(new URL('https://a.com/x'), get))).toBe('TIMEOUT')
   })
})
