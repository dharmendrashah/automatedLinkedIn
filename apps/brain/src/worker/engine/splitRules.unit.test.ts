import { describe, expect, it } from 'vitest'

import { onMainSide } from './splitRules'

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
