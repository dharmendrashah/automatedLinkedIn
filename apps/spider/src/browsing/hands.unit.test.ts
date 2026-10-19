import { describe, expect, it, vi } from 'vitest'

import { type DetectionSession } from '../scraping/driver'
import { handsOf } from './hands'

const page = { url: 'https://example.test/' }

const required = () => ({
   scrollBy: vi.fn(async () => true),
   inspect: vi.fn(async () => page),
   clickLink: vi.fn(async () => 'https://example.test/in/ada/'),
   back: vi.fn(async () => page.url),
   press: vi.fn(async () => ''),
})

describe('handsOf', () => {
   it('should refuse a browser that cannot inspect, click a link or go back', () => {
      const { back: _back, ...withoutBack } = required()

      expect(() => handsOf(withoutBack as never)).toThrow('This browser cannot browse by clicking.')
   })

   it('should say a click the browser cannot make did not happen, and let a move it cannot make pass', async () => {
      const hands = handsOf(required() as never)

      await expect(hands.clickSelector('button')).resolves.toBe(false)
      await expect(
         hands.clickInside(
            {
               x: 1,
               y: 2,
               width: 3,
               height: 4,
            },
            'button'
         )
      ).resolves.toBe(false)
      await expect(hands.hover(1, 2)).resolves.toBeUndefined()
      await expect(hands.drift()).resolves.toBeUndefined()
   })

   it('should call the browser as itself, with the block as an option', async () => {
      const seen: unknown[] = []
      const browser = {
         ...required(),
         inspect(this: unknown, options?: { block?: string }) {
            seen.push(this, options)

            return Promise.resolve(page)
         },
      }
      const hands = handsOf(browser as unknown as DetectionSession)

      await hands.inspect('[data-post]')
      await hands.inspect()

      expect(seen).toEqual([browser, { block: '[data-post]' }, browser, undefined])
   })
})
