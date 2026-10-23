import { describe, expect, it } from 'vitest'

import { type StorageLike, readJson, writeJson } from './storage'

const memory = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
   const data = { ...initial }

   return {
      data,
      getItem: key => data[key] ?? null,
      setItem: (key, value) => {
         data[key] = value
      },
   }
}

const asNumbers = (raw: unknown) =>
   Array.isArray(raw) ? raw.filter((value): value is number => typeof value === 'number') : []

describe('readJson', () => {
   it('should give what was saved, read by the parser', () => {
      expect(readJson(memory({ k: '[1,"x",2]' }), 'k', asNumbers, [])).toEqual([1, 2])
   })

   it('should give the fallback when nothing was saved, or what was saved is not JSON', () => {
      expect(readJson(memory(), 'k', asNumbers, [9])).toEqual([9])
      expect(readJson(memory({ k: '{oops' }), 'k', asNumbers, [9])).toEqual([9])
   })

   it('should give the fallback when storage cannot be read at all', () => {
      const broken: StorageLike = {
         getItem: () => {
            throw new Error('denied')
         },
         setItem: () => undefined,
      }

      expect(readJson(broken, 'k', asNumbers, [7])).toEqual([7])
      expect(readJson(undefined, 'k', asNumbers, [7])).toEqual([7])
   })
})

describe('writeJson', () => {
   it('should save a value, and say so', () => {
      const storage = memory()

      expect(writeJson(storage, 'k', [1, 2])).toBe(true)
      expect(storage.data.k).toBe('[1,2]')
   })

   it('should not throw when storage is full or denied, and say it did not save', () => {
      const full: StorageLike = {
         getItem: () => null,
         setItem: () => {
            throw new Error('quota')
         },
      }

      expect(writeJson(full, 'k', [1])).toBe(false)
      expect(writeJson(undefined, 'k', [1])).toBe(false)
   })

   it('should refuse a value that is too large to keep', () => {
      expect(writeJson(memory(), 'k', 'x'.repeat(2_000_000))).toBe(false)
   })
})
