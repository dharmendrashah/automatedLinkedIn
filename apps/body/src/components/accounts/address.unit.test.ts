import { describe, expect, it } from 'vitest'

import { readAddress, writeAddress } from './address'

const read = (query: string) => readAddress(new URLSearchParams(query))

describe('readAddress', () => {
   it('should read every part of a good address', () => {
      expect(read('q=acme&status=needs&open=abc-123&panel=activity')).toEqual({
         q: 'acme',
         chip: 'needs',
         open: 'abc-123',
         panel: 'activity',
      })
   })

   it('should ignore what it does not know and fall back to the plain list', () => {
      expect(read('status=nope&open=../etc&panel=other')).toEqual({
         q: '',
         chip: 'all',
         open: null,
         panel: null,
      })
   })

   it('should keep the bottom drawer only with an account open, and ignore an old client address', () => {
      expect(read('panel=activity').panel).toBeNull()
      expect(read('client=Acme&group=client&activity=Acme')).toEqual({
         q: '',
         chip: 'all',
         open: null,
         panel: null,
      })
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
      })

      expect(next.toString()).toBe('browse=busy&open=abc')
   })

   it('should drop the bottom drawer when the account closes', () => {
      const next = writeAddress(new URLSearchParams('open=abc&panel=activity'), { open: null })

      expect(next.toString()).toBe('')
   })

   it('should write what readAddress reads back', () => {
      const address = {
         q: 'a b',
         chip: 'ready' as const,
         open: 'x1',
         panel: 'activity' as const,
      }

      expect(readAddress(writeAddress(new URLSearchParams(), address))).toEqual(address)
   })
})
