import { describe, expect, it, vi } from 'vitest'

import { ObjectNotFoundError } from '../storage/store'
import { SessionVault } from './sessionVault'

const KEY = Buffer.alloc(32, 7).toString('base64')

const state = {
   cookies: [
      {
         name: 'li_at',
         value: 'LIAT-TOKEN-VALUE',
         domain: '.linkedin.com',
         path: '/',
         expires: 1_900_000_000,
         httpOnly: true,
         secure: true,
         sameSite: 'None' as const,
      },
   ],
   origins: [
      {
         origin: 'https://www.linkedin.com',
         localStorage: [
            {
               name: 'k',
               value: 'v',
            },
         ],
      },
   ],
}

const makeStore = () => {
   const objects = new Map<string, string>()

   return {
      objects,
      get: vi.fn(async (key: string) => {
         const body = objects.get(key)

         if (body === undefined) {
            throw new ObjectNotFoundError(key)
         }

         return body
      }),
      put: vi.fn(async (key: string, body: string) => {
         objects.set(key, body)
      }),
   }
}

describe('SessionVault', () => {
   it('should give back what it saved, and keep no login token readable in the bucket', async () => {
      const store = makeStore()
      const vault = new SessionVault(store, KEY)

      await vault.save('acc1', state)

      await expect(vault.load('acc1')).resolves.toEqual(state)
      expect([...store.objects.values()].join('')).not.toContain('LIAT-TOKEN-VALUE')
   })

   it('should answer nothing for an account that has no saved session', async () => {
      await expect(new SessionVault(makeStore(), KEY).load('acc1')).resolves.toBeUndefined()
   })

   it('should answer nothing, so the run signs in again, for a saved session it cannot open', async () => {
      const store = makeStore()

      await new SessionVault(store, KEY).save('acc1', state)

      const other = new SessionVault(store, Buffer.alloc(32, 9).toString('base64'))

      await expect(other.load('acc1')).resolves.toBeUndefined()

      store.objects.set('sessions/acc1/state.enc.json', 'not json')

      await expect(new SessionVault(store, KEY).load('acc1')).resolves.toBeUndefined()
   })

   it('should let a bucket that cannot be read fail the run instead of starting from nothing', async () => {
      const store = makeStore()

      store.get.mockRejectedValueOnce(new Error('bucket unavailable'))

      await expect(new SessionVault(store, KEY).load('acc1')).rejects.toThrow('bucket unavailable')
   })

   it('should refuse to keep a session that is too large', async () => {
      const store = makeStore()

      await expect(
         new SessionVault(store, KEY).save('acc1', {
            cookies: [],
            origins: [
               {
                  origin: 'https://www.linkedin.com',
                  localStorage: [
                     {
                        name: 'k',
                        value: 'x'.repeat(1_100_000),
                     },
                  ],
               },
            ],
         })
      ).rejects.toThrow(/too large/)
      expect(store.put).not.toHaveBeenCalled()
   })
})
