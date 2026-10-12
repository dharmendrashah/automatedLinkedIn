import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { combine, readDeviceAndBrowserInfo, readPixelscan } from './readers'

// Saved from the real pages on 2026-10-12 (see the spike in .plan/spider-browser-test.md). The bot variants below are
// derived from them by changing only the words and values the pages change.
const humanText = readFileSync(join(__dirname, 'fixtures/deviceandbrowserinfo.human.txt'), 'utf8')
const humanHtml = readFileSync(join(__dirname, 'fixtures/pixelscan.human.html'), 'utf8')

describe('readDeviceAndBrowserInfo', () => {
   it('should read a human verdict and every signal of the page', () => {
      const reading = readDeviceAndBrowserInfo(humanText)

      expect(reading.verdict).toBe('HUMAN')
      expect(reading.headline).toBe('You are human!')
      expect(reading.signals).toHaveLength(22)
      expect(reading.signals.every(signal => !signal.flagged)).toBe(true)
      expect(reading.signals.map(signal => signal.name)).toContain('hasWebdriverTrue')
   })

   it('should read a bot verdict and name the signals that were flagged', () => {
      const text = humanText
         .replace('"isBot": false', '"isBot": true')
         .replace('"hasWebdriverTrue": false', '"hasWebdriverTrue": true')
         .replace('"hasInconsistentWorkerValues": false', '"hasInconsistentWorkerValues": true')
         .replace('You are human!', 'You are a bot!')
      const reading = readDeviceAndBrowserInfo(text)

      expect(reading.verdict).toBe('BOT')
      expect(reading.headline).toBe('You are a bot!')
      expect(reading.signals.filter(signal => signal.flagged).map(signal => signal.name)).toEqual([
         'hasWebdriverTrue',
         'hasInconsistentWorkerValues',
      ])
   })

   it.each([
      ['a page that is not the test', 'Welcome. Please sign in.'],
      ['an empty page', ''],
      ['a result cut off in the middle', humanText.slice(0, humanText.indexOf('"hasWebdriverTrue"'))],
      ['a result whose verdict is not a boolean', humanText.replace('"isBot": false', '"isBot": "maybe"')],
   ])('should not guess from %s', (_name, text) => {
      const reading = readDeviceAndBrowserInfo(text)

      expect(reading.verdict).toBe('UNKNOWN')
      expect(reading.signals).toEqual([])
   })
})

describe('readPixelscan', () => {
   it('should read a human verdict and the categories of the page', () => {
      const reading = readPixelscan(humanHtml)

      expect(reading.verdict).toBe('HUMAN')
      expect(reading.headline).toBe("You're Definitely a Human")
      expect(reading.signals.map(signal => signal.name)).toEqual(['Navigator', 'Webdriver', 'CDP', 'User Agent'])
      expect(reading.signals.every(signal => !signal.flagged)).toBe(true)
   })

   it('should read a bot verdict and flag the categories that are not clear', () => {
      const html = humanHtml
         .replace('class="checker-header" state="success"', 'class="checker-header" state="error"')
         .replace(/(summary-section__title[^>]*>Webdriver<\/span>\s*<span[^>]*>)\s*Clear\s*/, '$1 Detected ')
      const reading = readPixelscan(html)

      expect(reading.verdict).toBe('BOT')
      expect(reading.headline).toBe('Bot Behavior Detected')
      expect(reading.signals.filter(signal => signal.flagged).map(signal => signal.name)).toEqual(['Webdriver'])
   })

   it.each(['default', 'loading'])('should not give a verdict while the page is still %s', state => {
      const reading = readPixelscan(humanHtml.replace('state="success"', `state="${state}"`))

      expect(reading.verdict).toBe('UNKNOWN')
   })

   it.each([
      ['a page that is not the test', '<html><body>Welcome</body></html>'],
      ['an empty page', ''],
   ])('should not guess from %s', (_name, html) => {
      expect(readPixelscan(html)).toEqual({
         verdict: 'UNKNOWN',
         headline: '',
         signals: [],
      })
   })
})

describe('combine', () => {
   it('should say not detected only when every page took the browser for a person', () => {
      expect(combine(['HUMAN', 'HUMAN'])).toBe('NOT_DETECTED')
   })

   it('should say detected as soon as one page says bot, even when another could not be read', () => {
      expect(combine(['HUMAN', 'BOT'])).toBe('DETECTED')
      expect(combine(['UNKNOWN', 'BOT'])).toBe('DETECTED')
   })

   it('should say it could not tell when a page was not understood and none said bot', () => {
      expect(combine(['HUMAN', 'UNKNOWN'])).toBe('COULD_NOT_TELL')
      expect(combine([])).toBe('COULD_NOT_TELL')
   })
})
