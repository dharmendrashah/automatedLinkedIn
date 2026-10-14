import { describe, expect, it } from 'vitest'

import { type DevStepEntry } from './pageRecorder'
import { renderSkeleton } from './skeleton'

const step = (partial: Partial<DevStepEntry>): DevStepEntry => ({
   n: 1,
   t: 0,
   call: 'click',
   durationMs: 0,
   ok: true,
   ...partial,
})

describe('renderSkeleton', () => {
   it('should render a goto step as context.visit', () => {
      const markdown = renderSkeleton([
         step({
            call: 'goto',
            target: 'https://example.com',
         }),
      ])

      expect(markdown).toContain("await context.visit('https://example.com')")
   })

   it('should render a click step as context.browser.click', () => {
      const markdown = renderSkeleton([
         step({
            call: 'click',
            selector: '#submit',
         }),
      ])

      expect(markdown).toContain("await context.browser.click('#submit')")
   })

   it('should render a fill step with its recorded value', () => {
      const markdown = renderSkeleton([
         step({
            call: 'fill',
            selector: '#email',
            value: 'a@example.com',
         }),
      ])

      expect(markdown).toContain("await context.browser.fill('#email', 'a@example.com')")
   })

   it('should mark a password field as not recorded, never a value', () => {
      const markdown = renderSkeleton([
         step({
            call: 'fill',
            selector: '#password',
            length: 8,
         }),
      ])

      expect(markdown).toContain("await context.browser.fill('#password', /* not recorded: a password field */)")
      expect(markdown).not.toContain('hunter2')
   })

   it('should escape single quotes in a recorded value', () => {
      const markdown = renderSkeleton([
         step({
            call: 'fill',
            selector: '#name',
            value: "O'Brien",
         }),
      ])

      expect(markdown).toContain("await context.browser.fill('#name', 'O\\'Brien')")
   })

   it('should list every step in order', () => {
      const markdown = renderSkeleton([
         step({
            n: 1,
            call: 'goto',
            target: 'https://example.com',
         }),
         step({
            n: 2,
            call: 'click',
            selector: '#submit',
         }),
      ])

      expect(markdown).toContain('- step 1: goto \u2014 https://example.com')
      expect(markdown).toContain('- step 2: click \u2014 #submit')
   })
})
