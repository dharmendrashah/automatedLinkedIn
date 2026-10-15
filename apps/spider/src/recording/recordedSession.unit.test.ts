import { describe, expect, it, vi } from 'vitest'

import { type LoginSession } from '../scraping/driver'
import { RecordedSession } from './recordedSession'

const makeInner = (overrides: Partial<LoginSession> = {}) =>
   ({
      addCookies: vi.fn(async () => undefined),
      cookies: vi.fn(async () => [
         {
            name: 'li_at',
            value: 'SECRET',
            domain: '.linkedin.com',
            path: '/',
         },
      ]),
      goto: vi.fn(async (url: string) => url),
      click: vi.fn(async () => 'https://www.linkedin.com/feed/'),
      extract: vi.fn(async () => [{ a: '1' }, { a: '2' }]),
      fill: vi.fn(async () => undefined),
      press: vi.fn(async () => 'https://www.linkedin.com/feed/'),
      exists: vi.fn(async () => true),
      close: vi.fn(async () => undefined),
      screenshot: vi.fn(async () => Buffer.from('png')),
      pageHtml: vi.fn(async () => '<html>page</html>'),
      ...overrides,
   }) as LoginSession & Record<string, ReturnType<typeof vi.fn>>

const makeRecorder = () => {
   const steps: Record<string, unknown>[] = []

   return {
      steps,
      addStep: vi.fn((step: Record<string, unknown>) => {
         const entry = {
            ...step,
            n: steps.length + 1,
         }

         steps.push(entry)

         return entry
      }),
      log: vi.fn(),
      addSecret: vi.fn(),
      saveScreenshot: vi.fn(async () => true),
      saveFailureHtml: vi.fn(),
   }
}

describe('RecordedSession', () => {
   it('should pass every call on and return what the browser returned', async () => {
      const inner = makeInner()
      const session = new RecordedSession(inner, makeRecorder() as never)

      await expect(session.goto('https://www.linkedin.com/login', '#username')).resolves.toBe(
         'https://www.linkedin.com/login'
      )
      await expect(session.click('button')).resolves.toBe('https://www.linkedin.com/feed/')
      await expect(session.exists('#x', 100)).resolves.toBe(true)
      await expect(session.extract({ wrapper: '.p' }, 5)).resolves.toHaveLength(2)
      await session.fill('#username', 'someone@example.com')
      await session.close()

      expect(inner.goto).toHaveBeenCalledWith('https://www.linkedin.com/login', '#username')
      expect(inner.fill).toHaveBeenCalledWith('#username', 'someone@example.com')
      expect(inner.close).toHaveBeenCalled()
   })

   it('should record a key press as a step with where it led, and pass it on', async () => {
      const recorder = makeRecorder()
      const inner = makeInner()
      const session = new RecordedSession(inner, recorder as never)

      await expect(session.press('Enter')).resolves.toBe('https://www.linkedin.com/feed/')

      expect(inner.press).toHaveBeenCalledWith('Enter')
      expect(recorder.steps[0]).toMatchObject({
         call: 'press',
         ok: true,
         urlAfter: 'https://www.linkedin.com/feed/',
      })
   })

   it('should record a step with its address, take a screenshot and number it after the step', async () => {
      const recorder = makeRecorder()
      const session = new RecordedSession(makeInner(), recorder as never)

      await session.goto('https://www.linkedin.com/login?token=ABC')
      await session.click('button[type="submit"]')

      expect(recorder.steps[0]).toMatchObject({
         call: 'goto',
         ok: true,
         urlAfter: 'https://www.linkedin.com/login?token=***',
         screenshot: '01-goto.png',
      })
      expect(recorder.steps[1]).toMatchObject({
         call: 'click',
         ok: true,
         selector: 'button[type="submit"]',
         urlBefore: 'https://www.linkedin.com/login?token=***',
         urlAfter: 'https://www.linkedin.com/feed/',
         screenshot: '02-click.png',
      })
      expect(recorder.saveScreenshot).toHaveBeenCalledWith('01-goto.png', Buffer.from('png'))
   })

   it('should record how many characters were typed, never which, and treat the text as a secret', async () => {
      const recorder = makeRecorder()
      const session = new RecordedSession(makeInner(), recorder as never)

      await session.fill('#password', 'hunter2-password')

      expect(recorder.steps[0]).toMatchObject({
         call: 'fill',
         selector: '#password',
         length: 16,
      })
      expect(JSON.stringify([recorder.steps, recorder.log.mock.calls])).not.toContain('hunter2-password')
      expect(recorder.addSecret).toHaveBeenCalledWith('hunter2-password')
   })

   it('should record whether an element showed up and how many records were read', async () => {
      const recorder = makeRecorder()
      const session = new RecordedSession(makeInner({ exists: vi.fn(async () => false) }), recorder as never)

      await session.exists('#error-for-username', 1500)
      await session.extract({ wrapper: '.p' }, 5)

      expect(recorder.steps[0]).toMatchObject({
         call: 'exists',
         found: false,
         selector: '#error-for-username',
      })
      expect(recorder.steps[1]).toMatchObject({
         call: 'extract',
         count: 2,
      })
   })

   it('should record a failing call with a screenshot and the page, and rethrow the same error', async () => {
      const recorder = makeRecorder()
      const failure = new Error('Timeout 30000ms exceeded waiting for #username at https://x.test/?token=ABC')
      const session = new RecordedSession(
         makeInner({ goto: vi.fn(async () => Promise.reject(failure)) }),
         recorder as never
      )

      await expect(session.goto('https://x.test/', '#username')).rejects.toBe(failure)

      expect(recorder.steps[0]).toMatchObject({
         call: 'goto',
         ok: false,
         error: 'Timeout 30000ms exceeded waiting for #username at https://x.test/?token=***',
         screenshot: '01-goto-failed.png',
      })
      expect(recorder.saveFailureHtml).toHaveBeenCalledWith('<html>page</html>')
      expect(recorder.log).toHaveBeenCalledWith('spider', 'error', expect.stringContaining('failed'))
   })

   it('should not need a browser that can take screenshots', async () => {
      const inner = makeInner()

      Object.assign(inner, {
         screenshot: undefined,
         pageHtml: undefined,
      })

      const recorder = makeRecorder()
      const session = new RecordedSession(inner, recorder as never)

      await session.goto('https://x.test/')

      expect(recorder.steps[0]).toMatchObject({ ok: true })
      expect(recorder.saveScreenshot).not.toHaveBeenCalled()
   })

   it('should not let a failing screenshot change what the run does', async () => {
      const recorder = makeRecorder()
      const session = new RecordedSession(
         makeInner({ screenshot: vi.fn(async () => Promise.reject(new Error('page closed'))) }),
         recorder as never
      )

      await expect(session.goto('https://x.test/')).resolves.toBe('https://x.test/')
      expect(recorder.steps[0]).toMatchObject({ ok: true })
   })

   it('should record the cookie calls without a screenshot or the cookie values', async () => {
      const recorder = makeRecorder()
      const session = new RecordedSession(makeInner(), recorder as never)

      await session.addCookies([])
      await session.cookies()

      expect(recorder.steps.map(step => step.call)).toEqual(['addCookies', 'cookies'])
      expect(recorder.saveScreenshot).not.toHaveBeenCalled()
      expect(JSON.stringify(recorder.steps)).not.toContain('SECRET')
   })

   it('should write one plain log line for each step', async () => {
      const recorder = makeRecorder()
      const session = new RecordedSession(makeInner(), recorder as never)

      await session.goto('https://x.test/')

      expect(recorder.log).toHaveBeenCalledWith('spider', 'info', expect.stringContaining('goto'))
   })
})
