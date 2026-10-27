import { describe, expect, it } from 'vitest'

import { readAddress, writeAddress } from './address'

const read = (query: string) => readAddress(new URLSearchParams(query))

describe('readAddress', () => {
   it('should read every part of a good address', () => {
      expect(read('q=acme&client=Acme&status=needs&group=client&open=abc-123&panel=activity&activity=Acme')).toEqual({
         q: 'acme',
         client: 'Acme',
         chip: 'needs',
         group: true,
         open: 'abc-123',
         panel: 'activity',
         activity: 'Acme',
      })
   })

   it('should ignore what it does not know and fall back to the plain list', () => {
      expect(read('status=nope&group=maybe&open=../etc&panel=other&activity=%20')).toEqual({
         q: '',
         client: '',
         chip: 'all',
         group: null,
         open: null,
         panel: null,
         activity: null,
      })
   })

   it('should keep the bottom drawer only with an account open, and say off when the owner turned grouping off', () => {
      expect(read('panel=activity').panel).toBeNull()
      expect(read('group=off').group).toBe(false)
   })

   it('should cut very long text', () => {
      expect(read(`q=${'a'.repeat(300)}`).q).toHaveLength(100)
   })
})

describe('writeAddress', () => {
   it('should leave defaults out and keep the parameters it does not own', () => {
      const next = writeAddress(new URLSearchParams('browse=busy&status=needs&q=x'), {
         chip: 'all',
         q: '  ',
         open: 'abc',
         group: true,
      })

      expect(next.toString()).toBe('browse=busy&group=client&open=abc')
   })

   it('should drop the bottom drawer when the account closes', () => {
      const next = writeAddress(new URLSearchParams('open=abc&panel=activity'), { open: null })

      expect(next.toString()).toBe('')
   })

   it('should write what readAddress reads back', () => {
      const address = {
         q: 'a b',
         client: 'Acme & Co',
         chip: 'ready' as const,
         group: false,
         open: 'x1',
         panel: 'activity' as const,
         activity: 'Acme & Co',
      }

      expect(readAddress(writeAddress(new URLSearchParams(), address))).toEqual(address)
   })
})
