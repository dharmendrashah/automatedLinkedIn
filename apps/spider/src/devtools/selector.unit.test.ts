import { describe, expect, it } from 'vitest'

import { type ElementInfo, buildSelector } from './selector'

const base: ElementInfo = {
   tag: 'button',
   path: 'div:nth-of-type(1) > button:nth-of-type(2)',
}

describe('buildSelector', () => {
   it('should prefer a data-testid', () => {
      expect(
         buildSelector({
            ...base,
            testId: 'submit-button',
            id: 'ignored',
         })
      ).toBe('[data-testid="submit-button"]')
   })

   it('should fall back to a plain id', () => {
      expect(
         buildSelector({
            ...base,
            id: 'login-email',
         })
      ).toBe('#login-email')
   })

   it('should ignore an id that is not a valid CSS identifier', () => {
      expect(
         buildSelector({
            ...base,
            id: '123-weird',
         })
      ).toBe('div:nth-of-type(1) > button:nth-of-type(2)')
   })

   it('should fall back to an aria-label', () => {
      expect(
         buildSelector({
            ...base,
            ariaLabel: 'Close dialog',
         })
      ).toBe('button[aria-label="Close dialog"]')
   })

   it('should fall back to a role', () => {
      expect(
         buildSelector({
            ...base,
            role: 'dialog',
         })
      ).toBe('button[role="dialog"]')
   })

   it('should fall back to short visible text', () => {
      expect(
         buildSelector({
            ...base,
            text: 'Sign in',
         })
      ).toBe('button:has-text("Sign in")')
   })

   it('should ignore text that is too long to be a stable selector', () => {
      expect(
         buildSelector({
            ...base,
            text: 'x'.repeat(61),
         })
      ).toBe('div:nth-of-type(1) > button:nth-of-type(2)')
   })

   it('should fall back to the structural path when nothing else is available', () => {
      expect(buildSelector(base)).toBe('div:nth-of-type(1) > button:nth-of-type(2)')
   })
})
