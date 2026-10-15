import { describe, expect, it, vi } from 'vitest'

import { ObjectNotFoundError } from '../storage/store'
import { type DeviceIdentity } from './deviceIdentity'
import { IdentityStore } from './identityStore'

const fresh = (width = 1366): DeviceIdentity => ({
   version: 1,
   os: 'windows',
   fingerprint: {
      screen: { width },
      navigator: { userAgent: 'Mozilla/5.0' },
   } as DeviceIdentity['fingerprint'],
   createdAt: '2026-10-15T10:00:00.000Z',
})

const makeStore = (initial?: DeviceIdentity) => {
   const objects = new Map<string, string>()

   if (initial) {
      objects.set('identities/acc1/identity.json', JSON.stringify(initial))
   }

   return {
      objects,
      get: vi.fn(async (key: string) => {
         const body = objects.get(key)

         if (body === undefined) {
            throw new ObjectNotFoundError(key)
         }

         return body
      }),
      create: vi.fn(async (key: string, body: string) => {
         if (objects.has(key)) {
            return undefined
         }

         objects.set(key, body)

         return '1'
      }),
      put: vi.fn(async (key: string, body: string) => {
         objects.set(key, body)
      }),
   }
}

describe('IdentityStore.forAccount', () => {
   it('should create the identity on the first call and give the same one on every later call', async () => {
      const store = makeStore()
      const make = vi.fn(() => fresh())
      const identities = new IdentityStore(store, make)

      const first = await identities.forAccount('acc1')
      const second = await identities.forAccount('acc1')

      expect(second).toEqual(first)
      expect(make).toHaveBeenCalledTimes(1)
      expect(store.objects.has('identities/acc1/identity.json')).toBe(true)
   })

   it('should keep the identity another worker created first when two workers start at once', async () => {
      const winner = fresh(1920)
      const store = makeStore()

      // The other worker writes between our read and our create.
      store.get.mockRejectedValueOnce(new ObjectNotFoundError('identities/acc1/identity.json'))
      store.create.mockImplementationOnce(async key => {
         store.objects.set(key, JSON.stringify(winner))

         return undefined
      })

      const result = await new IdentityStore(store, () => fresh(1366)).forAccount('acc1')

      expect(result).toEqual(winner)
   })

   it('should not replace the identity when the bucket cannot be read, since a new device would be worse than a retry', async () => {
      const store = makeStore()

      store.get.mockRejectedValueOnce(new Error('bucket unavailable'))

      await expect(new IdentityStore(store, () => fresh()).forAccount('acc1')).rejects.toThrow('bucket unavailable')
      expect(store.create).not.toHaveBeenCalled()
   })

   it('should refuse an identity it cannot read instead of silently starting a new device', async () => {
      const store = makeStore()

      store.objects.set('identities/acc1/identity.json', '{"version":2}')

      await expect(new IdentityStore(store, () => fresh()).forAccount('acc1')).rejects.toThrow()
      expect(store.create).not.toHaveBeenCalled()
   })
})

describe('IdentityStore.pin', () => {
   it('should keep the device and add the language, timezone and country the proxy exits in', async () => {
      const store = makeStore(fresh())
      const identities = new IdentityStore(store, () => fresh())
      const device = await identities.forAccount('acc1')

      const pinned = await identities.pin('acc1', device, {
         locale: 'de-DE',
         timezone: 'Europe/Berlin',
         country: 'DE',
      })

      expect(pinned).toEqual({
         ...device,
         locale: 'de-DE',
         timezone: 'Europe/Berlin',
         country: 'DE',
      })
      await expect(identities.forAccount('acc1')).resolves.toEqual(pinned)
   })

   it('should refuse a language that is not a language and a region', async () => {
      const store = makeStore(fresh())
      const identities = new IdentityStore(store, () => fresh())
      const device = await identities.forAccount('acc1')

      await expect(
         identities.pin('acc1', device, {
            locale: 'de',
            timezone: 'Europe/Berlin',
            country: 'DE',
         })
      ).rejects.toThrow()
      expect(store.put).not.toHaveBeenCalled()
   })
})
