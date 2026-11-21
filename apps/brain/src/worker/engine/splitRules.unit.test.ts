import { describe, expect, it } from 'vitest'

import { onMainSide, splitBin } from './splitRules'

const slugs = Array.from({ length: 10_000 }, (_unused, index) => `person-${index}`)

describe('onMainSide', () => {
   it('should put the same item on the same side every time, and differ per block', () => {
      expect(onMainSide('ada', 'split', 50)).toBe(onMainSide('ada', 'split', 50))

      const sides = (node: string) => slugs.slice(0, 200).map(slug => onMainSide(slug, node, 50))

      expect(sides('a')).not.toEqual(sides('b'))
   })

   it('should send about the share on, over a big batch', () => {
      for (const percent of [10, 50, 90]) {
         const on = slugs.filter(slug => onMainSide(slug, 'split', percent)).length

         expect(Math.abs(on - percent * 100)).toBeLessThan(300)
      }
   })

   it('should keep the edges: 1 percent sends few and 99 percent nearly all', () => {
      expect(slugs.filter(slug => onMainSide(slug, 'split', 1)).length).toBeLessThan(250)
      expect(slugs.filter(slug => onMainSide(slug, 'split', 99)).length).toBeGreaterThan(9_750)
   })
})

describe('splitBin', () => {
   it('should put the same item in the same bin every time, and differ per block', () => {
      expect(splitBin('ada', 'split', 3)).toBe(splitBin('ada', 'split', 3))

      const bins = (node: string) => slugs.slice(0, 200).map(slug => splitBin(slug, node, 3))

      expect(bins('a')).not.toEqual(bins('b'))
   })

   it('should spread about equally across every bin, over a big batch', () => {
      for (const parts of [2, 3, 4, 10]) {
         const counts = Array.from(
            { length: parts },
            (_unused, bin) => slugs.filter(slug => splitBin(slug, 'split', parts) === bin).length
         )

         expect(counts.reduce((total, count) => total + count, 0)).toBe(slugs.length)
         for (const count of counts) {
            expect(Math.abs(count - slugs.length / parts)).toBeLessThan(slugs.length / parts / 3)
         }
      }
   })

   it('should match onMainSide for 2 parts: the same item on the same side either way', () => {
      for (const slug of slugs.slice(0, 500)) {
         expect(splitBin(slug, 'split', 2) === 0).toBe(onMainSide(slug, 'split', 50))
      }
   })

   it('should never return a bin outside 0..parts-1', () => {
      for (const slug of slugs.slice(0, 500)) {
         expect(splitBin(slug, 'split', 10)).toBeGreaterThanOrEqual(0)
         expect(splitBin(slug, 'split', 10)).toBeLessThanOrEqual(9)
      }
   })
})
