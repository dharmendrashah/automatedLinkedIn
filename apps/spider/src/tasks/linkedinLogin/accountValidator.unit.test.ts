import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'

import { type LoginSession } from '../../scraping/driver'
import { AccountValidator } from './accountValidator'
import { totpCode } from './totp'

const BASE = 'https://www.linkedin.com'
const LI_AT = 'AQEDARz1x2aBcD3eFgHiJkLmNoPqRsTuVwXyZ0123456789-_abcdefghijklmnopqrstuvwxyz'
const NOW = Date.parse('2026-10-12T10:00:00.000Z')
// A two-step key from RFC 6238, so the expected code can be computed in the test.
const TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

const feedCookies = [
   {
      name: 'li_at',
      value: 'fresh',
      domain: '.linkedin.com',
      path: '/',
   },
   {
      name: 'other',
      value: 'x',
      domain: '.evil.org',
      path: '/',
   },
]

type Script = {
   // Where a page load ends up.
   load: (url: string) => string
   // Where submitting a form ends up, given the values typed so far.
   submit: (selector: string, typed: Record<string, string>, url: string) => string
   // The elements on the page at a url.
   elements: (url: string) => string[]
}

const fakeSession = (script: Script) => {
   let url = ''
   const typed: Record<string, string> = {}

   const session = {
      addCookies: vi.fn().mockResolvedValue(undefined),
      cookies: vi.fn().mockResolvedValue(feedCookies),
      goto: vi.fn(async (target: string) => {
         url = script.load(target)

         return url
      }),
      click: vi.fn(async (selector: string) => {
         url = script.submit(selector, typed, url)

         return url
      }),
      fill: vi.fn(async (selector: string, value: string) => {
         typed[selector] = value
      }),
      exists: vi.fn(async (selector: string) => script.elements(url).includes(selector)),
      extract: vi.fn().mockResolvedValue([]),
      close: vi.fn().mockResolvedValue(undefined),
   } satisfies LoginSession

   return {
      session,
      typed,
   }
}

const feed = `${BASE}/feed/`
const login = `${BASE}/login`
const checkpoint = `${BASE}/checkpoint/challenge/abc`

// A site where the token is valid or not, the password is right or not, and a code may be asked for.
const site = (
   rules: { token?: boolean; password?: string; challenge?: 'code' | 'puzzle'; code?: string; unknown?: boolean } = {}
): Script => ({
   load: target => {
      if (target.startsWith(feed)) {
         return rules.token ? feed : login
      }

      return target
   },
   submit: (selector, typed, url) => {
      if (url === checkpoint && selector === 'button[type="submit"]') {
         return typed['input[name="pin"]'] === rules.code ? feed : checkpoint
      }

      if (typed['#password'] === rules.password) {
         if (rules.unknown) {
            return `${BASE}/somewhere/else`
         }

         return rules.challenge ? checkpoint : feed
      }

      return login
   },
   elements: url => {
      if (url === login) {
         return ['#username', '#password', '#error-for-password']
      }

      if (url === checkpoint) {
         return rules.challenge === 'code' ? ['input[name="pin"]'] : []
      }

      return []
   },
})

const input = (credentials: Record<string, string>) => ({
   email: 'ada@work.com',
   credentials,
})

describe('AccountValidator', () => {
   let pause: Mock<(host: string) => Promise<void>>
   let validator: AccountValidator

   const build = (mode: 'full' | 'session' = 'full') =>
      new AccountValidator({
         baseUrl: BASE,
         mode,
         pause,
         now: () => NOW,
         allowsCookieDomain: domain => domain.endsWith('linkedin.com'),
      })

   beforeEach(() => {
      pause = vi.fn<(host: string) => Promise<void>>().mockResolvedValue(undefined)
      validator = build()
   })

   describe('with a browser token', () => {
      it('should be VALID when the token opens the feed, without typing anything', async () => {
         const { session } = fakeSession(site({ token: true }))

         await expect(validator.validate(session, input({ session: `li_at=${LI_AT}` }))).resolves.toEqual({
            outcome: 'VALID',
            cookies: [feedCookies[0]],
         })
         expect(session.addCookies).toHaveBeenCalledWith([
            expect.objectContaining({
               name: 'li_at',
               value: LI_AT,
               domain: '.linkedin.com',
               secure: true,
            }),
         ])
         expect(session.fill).not.toHaveBeenCalled()
      })

      it('should accept a whole pasted cookie dump', async () => {
         const { session } = fakeSession(site({ token: true }))

         await validator.validate(session, input({ session: `JSESSIONID="ajax:1"; li_at=${LI_AT}; lang=v=2` }))

         expect(session.addCookies).toHaveBeenCalledWith([expect.objectContaining({ value: LI_AT })])
      })

      it('should hand back only the cookies of allowed hosts', async () => {
         const { session } = fakeSession(site({ token: true }))
         const verdict = await validator.validate(session, input({ session: `li_at=${LI_AT}` }))

         expect(verdict).toMatchObject({ outcome: 'VALID' })
         expect(JSON.stringify(verdict)).not.toContain('evil.org')
      })

      it('should fall back to the password when the token is no longer accepted', async () => {
         const { session, typed } = fakeSession(
            site({
               token: false,
               password: 'hunter2',
            })
         )

         const verdict = await validator.validate(
            session,
            input({
               session: `li_at=${LI_AT}`,
               password: 'hunter2',
            })
         )

         expect(verdict).toMatchObject({ outcome: 'VALID' })
         expect(typed).toEqual({
            '#username': 'ada@work.com',
            '#password': 'hunter2',
         })
      })

      it('should say the token expired when there is no password to fall back to', async () => {
         const { session } = fakeSession(site({ token: false }))

         await expect(validator.validate(session, input({ session: `li_at=${LI_AT}` }))).resolves.toMatchObject({
            outcome: 'NEEDS_REAUTH',
            message: expect.stringMatching(/token/i),
         })
         expect(session.fill).not.toHaveBeenCalled()
      })

      it('should not use a pasted value that has no usable li_at, and go on with the password', async () => {
         const { session } = fakeSession(site({ password: 'hunter2' }))

         await validator.validate(
            session,
            input({
               session: 'JSESSIONID="ajax:1"',
               password: 'hunter2',
            })
         )

         expect(session.addCookies).not.toHaveBeenCalled()
         expect(session.fill).toHaveBeenCalled()
      })

      it('should report a security check on the feed page as NEEDS_REAUTH, without typing a password', async () => {
         const { session } = fakeSession({
            ...site({ token: true }),
            load: () => checkpoint,
         })

         await expect(
            validator.validate(
               session,
               input({
                  session: `li_at=${LI_AT}`,
                  password: 'hunter2',
               })
            )
         ).resolves.toMatchObject({
            outcome: 'NEEDS_REAUTH',
            message: expect.stringMatching(/security check/i),
         })
         expect(session.fill).not.toHaveBeenCalled()
      })
   })

   describe('with a password', () => {
      it('should type the email and the password once and be VALID when the feed opens', async () => {
         const { session, typed } = fakeSession(site({ password: 'hunter2' }))

         await expect(validator.validate(session, input({ password: 'hunter2' }))).resolves.toEqual({
            outcome: 'VALID',
            cookies: [feedCookies[0]],
         })
         expect(session.fill).toHaveBeenCalledTimes(2)
         expect(typed).toEqual({
            '#username': 'ada@work.com',
            '#password': 'hunter2',
         })
      })

      it('should be VALID without typing when the login page already shows the feed', async () => {
         const { session } = fakeSession({
            ...site(),
            load: () => feed,
         })

         await expect(validator.validate(session, input({ password: 'hunter2' }))).resolves.toMatchObject({
            outcome: 'VALID',
         })
         expect(session.fill).not.toHaveBeenCalled()
      })

      it('should answer INVALID_CREDENTIALS for a wrong password, and never try a second time', async () => {
         const { session } = fakeSession(site({ password: 'right' }))

         await expect(validator.validate(session, input({ password: 'wrong' }))).resolves.toMatchObject({
            outcome: 'INVALID_CREDENTIALS',
            message: expect.stringMatching(/email or password/i),
         })
         expect(session.fill).toHaveBeenCalledTimes(2)
         expect(session.click).toHaveBeenCalledTimes(1)
      })

      it('should answer a code from the two-step key when LinkedIn asks for one', async () => {
         const code = totpCode(TOTP_SECRET, NOW)
         const { session, typed } = fakeSession(
            site({
               password: 'hunter2',
               challenge: 'code',
               code,
            })
         )

         await expect(
            validator.validate(
               session,
               input({
                  password: 'hunter2',
                  totpSecret: TOTP_SECRET,
               })
            )
         ).resolves.toMatchObject({ outcome: 'VALID' })
         expect(typed['input[name="pin"]']).toBe(code)
      })

      it('should say a code is needed when LinkedIn asks for one and no two-step key is stored', async () => {
         const { session } = fakeSession(
            site({
               password: 'hunter2',
               challenge: 'code',
               code: '000000',
            })
         )

         await expect(validator.validate(session, input({ password: 'hunter2' }))).resolves.toMatchObject({
            outcome: 'NEEDS_REAUTH',
            message: expect.stringMatching(/two-step/i),
         })
      })

      it('should try the code only once, so a wrong key cannot lock the account', async () => {
         const { session } = fakeSession(
            site({
               password: 'hunter2',
               challenge: 'code',
               code: '000000',
            })
         )

         await expect(
            validator.validate(
               session,
               input({
                  password: 'hunter2',
                  totpSecret: TOTP_SECRET,
               })
            )
         ).resolves.toMatchObject({ outcome: 'NEEDS_REAUTH' })
         expect(session.click).toHaveBeenCalledTimes(2)
      })

      it('should never try to solve a puzzle or another kind of security check', async () => {
         const { session } = fakeSession(
            site({
               password: 'hunter2',
               challenge: 'puzzle',
            })
         )

         await expect(
            validator.validate(
               session,
               input({
                  password: 'hunter2',
                  totpSecret: TOTP_SECRET,
               })
            )
         ).resolves.toMatchObject({
            outcome: 'NEEDS_REAUTH',
            message: expect.stringMatching(/security check/i),
         })
         expect(session.fill).toHaveBeenCalledTimes(2)
      })

      it('should report a page it does not understand as ERROR', async () => {
         const { session } = fakeSession(
            site({
               password: 'hunter2',
               unknown: true,
            })
         )

         await expect(validator.validate(session, input({ password: 'hunter2' }))).resolves.toMatchObject({
            outcome: 'ERROR',
         })
      })

      it('should report ERROR, without the raw error, when LinkedIn will not load a page', async () => {
         const { session } = fakeSession(site())

         session.goto.mockRejectedValue(new Error('The site answered 999 TOPSECRETDETAIL'))

         const verdict = await validator.validate(session, input({ password: 'hunter2' }))

         expect(verdict).toMatchObject({ outcome: 'ERROR' })
         expect(JSON.stringify(verdict)).not.toContain('TOPSECRETDETAIL')
      })
   })

   describe('with nothing usable', () => {
      it('should say credentials are missing instead of opening a page', async () => {
         const { session } = fakeSession(site())

         await expect(validator.validate(session, input({}))).resolves.toMatchObject({ outcome: 'NEEDS_REAUTH' })
         expect(session.goto).not.toHaveBeenCalled()
      })
   })

   describe('in session-only mode', () => {
      it('should not type a password even when the token fails', async () => {
         const { session } = fakeSession(
            site({
               token: false,
               password: 'hunter2',
            })
         )

         await expect(
            build('session').validate(
               session,
               input({
                  session: `li_at=${LI_AT}`,
                  password: 'hunter2',
               })
            )
         ).resolves.toMatchObject({ outcome: 'NEEDS_REAUTH' })
         expect(session.fill).not.toHaveBeenCalled()
      })

      it('should say password sign-in is switched off when only a password is stored', async () => {
         const { session } = fakeSession(site({ password: 'hunter2' }))

         await expect(build('session').validate(session, input({ password: 'hunter2' }))).resolves.toMatchObject({
            outcome: 'NEEDS_REAUTH',
            message: expect.stringMatching(/switched off/i),
         })
         expect(session.goto).not.toHaveBeenCalled()
      })
   })

   describe('safety', () => {
      it('should wait between steps, on the host it visits', async () => {
         const { session } = fakeSession(site({ password: 'hunter2' }))

         await validator.validate(session, input({ password: 'hunter2' }))

         expect(pause).toHaveBeenCalledWith('www.linkedin.com')
      })

      it('should never put a secret in a verdict', async () => {
         const outcomes = await Promise.all([
            validator.validate(fakeSession(site({ password: 'right' })).session, input({ password: 'wrongPASSWORD' })),
            validator.validate(
               fakeSession(
                  site({
                     password: 'p',
                     challenge: 'code',
                     code: 'x',
                  })
               ).session,
               input({
                  password: 'p',
                  totpSecret: TOTP_SECRET,
               })
            ),
            validator.validate(fakeSession(site({ token: false })).session, input({ session: `li_at=${LI_AT}` })),
         ])
         const text = JSON.stringify(outcomes)

         expect(text).not.toContain('wrongPASSWORD')
         expect(text).not.toContain(TOTP_SECRET)
         expect(text).not.toContain(LI_AT)
      })
   })
})
