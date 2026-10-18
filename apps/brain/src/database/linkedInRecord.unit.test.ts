import { describe, expect, it, vi } from 'vitest'

import { mergeLabels, relabel } from './linkedInRecord'

describe('labels', () => {
   it('should remove, then add after the labels already there, up to the limit', () => {
      expect(
         mergeLabels(['acme', 'old'], {
            add: ['fintech', 'acme'],
            remove: ['old'],
         })
      ).toEqual({
         labels: ['acme', 'fintech'],
         full: false,
      })

      const twenty = Array.from({ length: 20 }, (_, index) => `l${index}`)

      expect(
         mergeLabels(twenty, {
            add: ['new'],
            remove: [],
         })
      ).toEqual({
         labels: twenty,
         full: true,
      })
   })

   it('should write only the rows a change touches and count the full ones', async () => {
      const write = vi.fn().mockResolvedValue(undefined)
      const rows = [
         {
            id: 'a',
            tags: ['acme'],
         },
         {
            id: 'b',
            tags: [],
         },
      ]

      await expect(
         relabel(
            rows,
            {
               add: ['acme'],
               remove: [],
            },
            write
         )
      ).resolves.toEqual({
         changed: 1,
         full: 0,
      })
      expect(write).toHaveBeenCalledExactlyOnceWith('b', ['acme'])
   })
})
