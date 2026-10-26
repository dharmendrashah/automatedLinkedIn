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
      await expect(hands.clickNth('.row', 3, 'button')).resolves.toBe(false)
      await expect(hands.scrollOver('.row', 300)).resolves.toBe(false)
      await expect(hands.typeKeys('Hello')).resolves.toBe(false)
      await expect(hands.attachFiles('input', ['/tmp/a.pdf'])).resolves.toBe(false)
      await expect(hands.chooseFiles('dialog button', 2, ['/tmp/a.pdf'])).resolves.toBe(false)
      await expect(hands.fetchFile('https://media.licdn.com/a', 10)).resolves.toBeUndefined()
      expect(hands.watchAnswers('POST', ['send']).statuses()).toEqual([])
      expect(() => hands.watchAnswers('POST', ['send']).stop()).not.toThrow()
      await expect(hands.hover(1, 2)).resolves.toBeUndefined()
      await expect(hands.drift()).resolves.toBeUndefined()
   })

   it('should type through a browser that can, as itself, and say it did', async () => {
      const seen: unknown[] = []
      const browser = {
         ...required(),
         typeKeys(this: unknown, text: string) {
            seen.push(this, text)

            return Promise.resolve()
         },
      }

      await expect(handsOf(browser as unknown as DetectionSession).typeKeys('Hi\nthere')).resolves.toBe(true)
      expect(seen).toEqual([browser, 'Hi\nthere'])
   })

   it('should hand the flag that brings an element into view on to the browser, with the rest of the click', async () => {
      const seen: unknown[][] = []
      const browser = {
         ...required(),
         clickNth: vi.fn(async (...args: unknown[]) => {
            seen.push(args)

            return true
         }),
      }
      const hands = handsOf(browser as unknown as DetectionSession)

      await expect(hands.clickNth('.row', 3, 'button', true)).resolves.toBe(true)
      await hands.clickNth('.row', 4, 'button')

      expect(seen).toEqual([
         ['.row', 3, 'button', true],
         ['.row', 4, 'button', undefined],
      ])
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
