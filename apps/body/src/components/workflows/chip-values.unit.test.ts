import { describe, expect, it } from 'vitest'

import { addValues, suggestionsFor } from './chip-values'

describe('chip values', () => {
   it('should split a pasted list into chips and skip the ones already there', () => {
      expect(addValues(undefined, ['CEO'], 'Founder, ceo\nHead of Sales;\tCTO', 50)).toEqual({
         values: ['CEO', 'Founder', 'Head of Sales', 'CTO'],
         refused: [],
      })
   })

   it('should clean websites and refuse links that are not on LinkedIn', () => {
      expect(addValues('domains', [], 'https://www.Stripe.com/pricing, not a site', 50)).toEqual({
         values: ['stripe.com'],
         refused: ['not a site'],
      })
      expect(addValues('links', [], 'linkedin.com/in/ada?utm=x\nhttps://example.com/x', 50)).toEqual({
         values: ['linkedin.com/in/ada'],
         refused: ['https://example.com/x'],
      })
   })

   it('should stop at the field limit', () => {
      expect(addValues(undefined, ['a'], 'b, c', 2).values).toEqual(['a', 'b'])
   })

   it('should suggest built-in titles that start with what was typed first', () => {
      expect(suggestionsFor('titles', 'head of s', [])).toEqual(['Head of Sales'])
      expect(suggestionsFor('titles', 'cto', ['CTO'])).not.toContain('CTO')
      expect(suggestionsFor(undefined, 'a', [])).toEqual([])
   })
})
