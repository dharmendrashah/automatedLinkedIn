import { describe, expect, it } from 'vitest'

import {
   actionLabel,
   describeStep,
   formatDuration,
   hintFor,
   proxyLabel,
   resultOf,
   shortAddress,
   timeAgo,
} from './describe'

const step = (overrides: Record<string, unknown> = {}) =>
   ({
      n: 1,
      t: 0,
      call: 'goto',
      durationMs: 10,
      ok: true,
      ...overrides,
   }) as Parameters<typeof describeStep>[0]

describe('actionLabel', () => {
   it('should name what the run was for in plain words', () => {
      expect(actionLabel('VALIDATE_ACCOUNT')).toBe('Check account sign-in')
      expect(actionLabel('SCRAPE')).toBe('Collect data')
      expect(actionLabel('BROWSER_TEST')).toBe('Browser test')
   })
})

describe('resultOf', () => {
   it.each([
      [{ status: 'SUCCEEDED', noAnswer: false }, 'Success', 'success'],
      [{ status: 'FAILED', noAnswer: false }, 'Failed', 'failure'],
      [{ status: 'IN_PROGRESS', noAnswer: false }, 'In progress', 'running'],
      [{ status: 'IN_PROGRESS', noAnswer: true }, 'No answer', 'unknown'],
      [{ status: 'SUCCEEDED', noAnswer: false, kind: 'BROWSER_TEST', outcome: 'NOT_DETECTED' }, 'Not detected', 'success'],
      [{ status: 'FAILED', noAnswer: false, kind: 'BROWSER_TEST', outcome: 'DETECTED' }, 'Detected as a bot', 'failure'],
      [{ status: 'FAILED', noAnswer: false, kind: 'BROWSER_TEST', outcome: 'COULD_NOT_TELL' }, 'Could not tell', 'neutral'],
      [{ status: 'FAILED', noAnswer: false, kind: 'BROWSER_TEST', outcome: 'ERROR' }, 'Failed', 'failure'],
      [{ status: 'IN_PROGRESS', noAnswer: false, kind: 'BROWSER_TEST', outcome: null }, 'In progress', 'running'],
   ] as const)('should show %j as %s', (input, label, tone) => {
      expect(resultOf(input)).toEqual({
         label,
         tone,
      })
   })
})

describe('shortAddress', () => {
   it('should show the site and the page without the scheme, the query or credentials', () => {
      expect(shortAddress('https://www.linkedin.com/checkpoint/challenge/abc?token=***&x=1')).toBe(
         'www.linkedin.com/checkpoint/challenge/abc'
      )
      expect(shortAddress('https://www.linkedin.com/')).toBe('www.linkedin.com')
   })

   it('should leave text that is not an address as it is', () => {
      expect(shortAddress('not a url')).toBe('not a url')
   })
})

describe('describeStep', () => {
   it('should say the page was scrolled down', () => {
      expect(describeStep(step({ call: 'scroll' }))).toBe('Scrolled down the page')
   })

   it('should say a page was opened, and where the browser ended up if it moved', () => {
      expect(
         describeStep(
            step({
               target: 'https://www.linkedin.com/login',
               urlAfter: 'https://www.linkedin.com/login',
            })
         )
      ).toBe('Opened www.linkedin.com/login')
      expect(
         describeStep(
            step({
               target: 'https://www.linkedin.com/feed/',
               urlAfter: 'https://www.linkedin.com/login',
            })
         )
      ).toBe('Opened www.linkedin.com/feed and landed on www.linkedin.com/login')
   })

   it('should say that a page could not be opened', () => {
      expect(
         describeStep(
            step({
               ok: false,
               target: 'https://www.linkedin.com/login',
            })
         )
      ).toBe('Could not open www.linkedin.com/login')
   })

   it('should describe typing by how much, never what', () => {
      expect(
         describeStep(
            step({
               call: 'fill',
               length: 12,
            })
         )
      ).toBe('Typed 12 characters into a field')
      expect(
         describeStep(
            step({
               call: 'fill',
               length: 1,
            })
         )
      ).toBe('Typed 1 character into a field')
   })

   it('should describe a click and where it led', () => {
      expect(
         describeStep(
            step({
               call: 'click',
               urlAfter: 'https://www.linkedin.com/feed/',
            })
         )
      ).toBe('Clicked an element and moved to www.linkedin.com/feed')
      expect(
         describeStep(
            step({
               call: 'click',
               ok: false,
            })
         )
      ).toBe('Could not click the element')
   })

   it('should describe looking for an element', () => {
      expect(
         describeStep(
            step({
               call: 'exists',
               found: true,
            })
         )
      ).toBe('Looked for an element and found it')
      expect(
         describeStep(
            step({
               call: 'exists',
               found: false,
            })
         )
      ).toBe('Looked for an element and it was not there')
   })

   it('should describe reading the page and the browser session', () => {
      expect(describeStep(step({ call: 'extract', count: 1 }))).toBe('Read 1 item from the page')
      expect(describeStep(step({ call: 'extract', count: 5 }))).toBe('Read 5 items from the page')
      expect(describeStep(step({ call: 'cookies' }))).toBe("Collected the browser's session")
      expect(describeStep(step({ call: 'addCookies' }))).toBe('Loaded the saved browser session')
   })

   it('should still say something for a call it does not know', () => {
      expect(describeStep(step({ call: 'teleport' }))).toBe('teleport')
   })
})

describe('hintFor', () => {
   it.each([
      ['LinkedIn showed a page the check does not understand.', /changed this page/i],
      ['LinkedIn did not let the check load a page.', /did not load/i],
      ['LinkedIn asked for a security check that you have to complete yourself.', /confirm it is you/i],
      ['The check could not be queued. Try again in a moment.', /try again/i],
   ])('should explain: %s', (message, hint) => {
      expect(hintFor(message)).toMatch(hint)
   })

   it('should have nothing to add for an answer it does not know', () => {
      expect(hintFor('Something else')).toBeUndefined()
      expect(hintFor(null)).toBeUndefined()
   })
})

describe('proxyLabel', () => {
   it('should show the proxy address as it was, and say so when there was none', () => {
      expect(
         proxyLabel({
            proxyProtocol: 'SOCKS5',
            proxyHost: 'proxy.example.net',
            proxyPort: 1080,
         })
      ).toBe('socks5://proxy.example.net:1080')
      expect(
         proxyLabel({
            proxyProtocol: null,
            proxyHost: null,
            proxyPort: null,
         })
      ).toBe('No proxy')
   })
})

describe('formatDuration', () => {
   it.each([
      [null, '—'],
      [0, '0 ms'],
      [450, '450 ms'],
      [14_200, '14 s'],
      [65_000, '1 min 5 s'],
      [120_000, '2 min'],
   ])('should show %s as %s', (ms, text) => {
      expect(formatDuration(ms)).toBe(text)
   })
})

describe('timeAgo', () => {
   const now = Date.parse('2026-10-12T12:00:00.000Z')

   it.each([
      ['2026-10-12T11:59:40.000Z', 'just now'],
      ['2026-10-12T11:58:00.000Z', '2 min ago'],
      ['2026-10-12T09:00:00.000Z', '3 h ago'],
      ['2026-10-10T12:00:00.000Z', '2 days ago'],
   ])('should show %s as %s', (iso, text) => {
      expect(timeAgo(new Date(iso), now)).toBe(text)
   })
})
