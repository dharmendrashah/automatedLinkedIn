import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'

import { SECURITY_CHECK_MESSAGE } from '@automatedLinkedIn/contracts'

import { type LoginSession } from '../../scraping/driver'
import { AccountValidator, SELECTORS, rememberedAccount } from './accountValidator'
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
   // Where the browser is once the redirects after a submit are done, when that differs from where the submit left it.
   settle?: (url: string) => string
   // What typing into a field does to the page, such as a code box that sends itself after the last digit.
   type?: (selector: string, value: string, url: string) => string
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
      press: vi.fn(async (key: string) => {
         url = script.submit(key, typed, url)

         return url
      }),
      fill: vi.fn(async (selector: string, value: string) => {
         typed[selector] = value
      }),
      type: vi.fn(async (selector: string, value: string) => {
         typed[selector] = value
         url = script.type ? script.type(selector, value, url) : url
      }),
      exists: vi.fn(async (selector: string) => script.elements(url).some(element => selector.includes(element))),
      settled: vi.fn(async () => {
         url = script.settle ? script.settle(url) : url

         return url
      }),
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
const restricted = `${BASE}/flagship-web/login/login-restriction/`

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
      if (url === checkpoint && selector === SELECTORS.codeSubmit) {
         return typed[SELECTORS.codeField] === rules.code ? feed : checkpoint
      }

      if (typed[SELECTORS.password] === rules.password) {
         if (rules.unknown) {
            return `${BASE}/somewhere/else`
         }

         return rules.challenge ? checkpoint : feed
      }

      return login
   },
   elements: url => {
      if (url === login) {
         return [SELECTORS.username, SELECTORS.password, '#error-for-password']
      }

      if (url === checkpoint) {
         return rules.challenge === 'code' ? [SELECTORS.codeInput, SELECTORS.codeSubmit] : []
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
   let sleep: Mock<(ms: number) => Promise<void>>
   let validator: AccountValidator

   const build = (mode: 'full' | 'session' = 'full') =>
      new AccountValidator({
         baseUrl: BASE,
         mode,
         pause,
         sleep,
         now: () => NOW,
         allowsCookieDomain: domain => domain.endsWith('linkedin.com'),
      })

   beforeEach(() => {
      pause = vi.fn<(host: string) => Promise<void>>().mockResolvedValue(undefined)
      sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined)
      validator = build()
   })

   describe('looking again after the owner finished a security check', () => {
      it('should be VALID, typing nothing, when the feed opens now', async () => {
         const { session, typed } = fakeSession(site({ token: true }))

         const verdict = await validator.recheck(session, input({}).credentials)

         expect(verdict).toEqual({
            outcome: 'VALID',
            cookies: [feedCookies[0]],
         })
         expect(typed).toEqual({})
         expect(session.fill).not.toHaveBeenCalled()
      })

      it('should still say security check when LinkedIn sends the browser back to the login or the check', async () => {
         const { session } = fakeSession(site({ token: false }))

         await expect(validator.recheck(session, input({}).credentials)).resolves.toMatchObject({
            outcome: 'NEEDS_REAUTH',
            message: SECURITY_CHECK_MESSAGE,
         })
      })

      it('should report ERROR, without the raw error, when the page cannot be loaded', async () => {
         const { session } = fakeSession(site({ token: true }))

         session.goto.mockRejectedValueOnce(new Error('net::ERR_PROXY_CONNECTION_FAILED at 10.0.0.1'))

         const verdict = await validator.recheck(session, input({}).credentials)

         expect(verdict).toMatchObject({ outcome: 'ERROR' })
         expect(JSON.stringify(verdict)).not.toContain('10.0.0.1')
      })

      it('should wait the politeness gap before it loads the page', async () => {
         const { session } = fakeSession(site({ token: true }))

         await validator.recheck(session, input({}).credentials)

         expect(pause).toHaveBeenCalledWith('www.linkedin.com')
      })

      it('should answer the two-step code itself when the owner got past the puzzle and LinkedIn now asks for it', async () => {
         const code = totpCode(TOTP_SECRET, NOW)
         const { session, typed } = fakeSession({
            ...site({
               challenge: 'code',
               code,
            }),
            load: () => checkpoint,
         })

         await expect(
            validator.recheck(session, input({ totpSecret: TOTP_SECRET }).credentials)
         ).resolves.toMatchObject({ outcome: 'VALID' })
         expect(typed[SELECTORS.codeField]).toBe(code)
      })

      it('should say a code is needed when LinkedIn asks for one and none is stored', async () => {
         const { session } = fakeSession({
            ...site({
               challenge: 'code',
               code: '000000',
            }),
            load: () => checkpoint,
         })

         await expect(validator.recheck(session, input({}).credentials)).resolves.toMatchObject({
            outcome: 'NEEDS_REAUTH',
            message: expect.stringMatching(/two-step/i),
         })
         expect(session.fill).not.toHaveBeenCalled()
      })

      it('should say the account is restricted when LinkedIn shows the restriction page', async () => {
         const { session } = fakeSession({
            ...site(),
            load: () => restricted,
         })

         await expect(validator.recheck(session, input({}).credentials)).resolves.toMatchObject({
            outcome: 'BLOCKED',
            message: expect.stringMatching(/restricted/i),
         })
      })
   })

   describe('sending the form, and a captcha', () => {
      const withButton: Script = {
         ...site({ password: 'hunter2' }),
         elements: url => (url === login ? [SELECTORS.username, SELECTORS.password, SELECTORS.submit] : []),
      }

      it('should send the language of the account as a cookie before any page is loaded', async () => {
         const { session } = fakeSession(withButton)

         await validator.validate(session, {
            ...input({ password: 'hunter2' }),
            language: 'en-US',
         })

         expect(session.addCookies).toHaveBeenCalledWith([
            expect.objectContaining({
               name: 'lang',
               value: 'v=2&lang=en-us',
               domain: '.linkedin.com',
            }),
         ])
         expect(session.addCookies.mock.invocationCallOrder[0]).toBeLessThan(session.goto.mock.invocationCallOrder[0])
      })

      it('should send nothing, and say so, when the form does not keep what was typed', async () => {
         const { session } = fakeSession(withButton)

         session.fill.mockRejectedValueOnce(new Error('The field did not keep what was typed'))

         await expect(validator.validate(session, input({ password: 'hunter2' }))).resolves.toMatchObject({
            outcome: 'ERROR',
            message: expect.stringMatching(/did not keep what was typed/i),
         })
         expect(session.click).not.toHaveBeenCalled()
         expect(session.press).not.toHaveBeenCalled()
      })

      it('should send no language cookie when the account has none', async () => {
         const { session } = fakeSession(withButton)

         await validator.validate(session, input({ password: 'hunter2' }))

         expect(session.addCookies).not.toHaveBeenCalled()
      })

      it('should click the submit button under the password when the page shows one', async () => {
         const { session } = fakeSession(withButton)

         const verdict = await validator.validate(session, input({ password: 'hunter2' }))

         expect(verdict).toMatchObject({ outcome: 'VALID' })
         expect(session.click).toHaveBeenCalledWith(SELECTORS.submit)
         expect(session.press).not.toHaveBeenCalled()
      })

      it('should press Enter when the page shows no such button', async () => {
         const { session } = fakeSession(site({ password: 'hunter2' }))

         await validator.validate(session, input({ password: 'hunter2' }))

         expect(session.press).toHaveBeenCalledWith('Enter')
      })

      it('should hand a captcha on the sign-in page to its owner as a security check, never solve it', async () => {
         const { session } = fakeSession({
            ...site({ password: 'hunter2' }),
            submit: () => login,
            elements: () => [SELECTORS.captcha],
         })

         await expect(validator.validate(session, input({ password: 'hunter2' }))).resolves.toMatchObject({
            outcome: 'NEEDS_REAUTH',
            message: SECURITY_CHECK_MESSAGE,
         })
      })

      it('should not wait out the whole time once a challenge frame shows', async () => {
         const { session } = fakeSession({
            ...site({ password: 'hunter2' }),
            submit: () => login,
            elements: () => [SELECTORS.challenge],
         })

         await expect(validator.validate(session, input({ password: 'hunter2' }))).resolves.toMatchObject({
            outcome: 'NEEDS_REAUTH',
            message: SECURITY_CHECK_MESSAGE,
         })
         expect(sleep).not.toHaveBeenCalled()
      })

      it('should answer the two-step code on the page the captcha led to, and wait for the page after it', async () => {
         const code = totpCode(TOTP_SECRET, NOW)
         const { session, typed } = fakeSession({
            ...site({
               challenge: 'code',
               code,
            }),
            settle: url => url || checkpoint,
         })

         await expect(
            validator.recheck(session, input({ totpSecret: TOTP_SECRET }).credentials)
         ).resolves.toMatchObject({ outcome: 'VALID' })
         expect(typed[SELECTORS.codeField]).toBe(code)
         expect(session.goto).not.toHaveBeenCalled()
      })

      it('should read the page the owner finished the captcha on, without loading another one first', async () => {
         const { session } = fakeSession({
            ...site(),
            settle: () => feed,
         })

         await expect(validator.recheck(session, input({}).credentials)).resolves.toMatchObject({ outcome: 'VALID' })
         expect(session.goto).not.toHaveBeenCalled()
      })
   })

   describe('the redirects after a submit', () => {
      // The sign-in page keeps its address while LinkedIn works on it (a spinner, a quick security check of its own).
      const working = (movesOnAfter: number, movesTo: string): Script => {
         let polls = 0

         return {
            ...site({ password: 'hunter2' }),
            submit: () => login,
            elements: () => [],
            settle: url => {
               polls += 1

               return polls > movesOnAfter ? movesTo : url
            },
         }
      }

      it('should wait while the sign-in page is only working, and read where it moves on to', async () => {
         const { session } = fakeSession(working(3, feed))

         const result = await validator.validate(session, input({ password: 'hunter2' }))

         expect(result.outcome).toBe('VALID')
         expect(sleep).toHaveBeenCalled()
      })

      it('should not wait when the sign-in page shows that the password was wrong', async () => {
         const { session } = fakeSession(site({ password: 'right' }))

         const result = await validator.validate(session, input({ password: 'wrong' }))

         expect(result.outcome).toBe('INVALID_CREDENTIALS')
         expect(sleep).not.toHaveBeenCalled()
      })

      it('should not wait for ever for a page that never moves on', async () => {
         const { session } = fakeSession(working(Number.POSITIVE_INFINITY, feed))

         await expect(validator.validate(session, input({ password: 'hunter2' }))).resolves.toMatchObject({
            outcome: 'ERROR',
            message: expect.stringMatching(/does not understand/i),
         })
         expect(sleep.mock.calls.length).toBeLessThanOrEqual(20)
         expect(sleep.mock.calls.length).toBeGreaterThan(3)
      })

      // LinkedIn answers a submit on the same page and moves on a moment later, so the page is read only once it settles.
      it('should be VALID when the page only reaches the feed after the redirects', async () => {
         const { session } = fakeSession({
            ...site({
               password: 'hunter2',
               challenge: 'puzzle',
            }),
            submit: () => login,
            settle: () => feed,
         })

         const verdict = await validator.validate(session, input({ password: 'hunter2' }))

         expect(verdict).toMatchObject({ outcome: 'VALID' })
         expect(session.settled).toHaveBeenCalled()
      })

      it('should say the account is restricted when the sign-in ends on the restriction page', async () => {
         let codeSent = false
         const { session } = fakeSession({
            ...site({
               password: 'hunter2',
               challenge: 'code',
               code: '000000',
            }),
            submit: (selector, typed, url) => {
               if (selector === SELECTORS.codeSubmit) {
                  codeSent = true

                  return checkpoint
               }

               return typed[SELECTORS.password] === 'hunter2' ? checkpoint : url
            },
            // The code page is still shown right after the submit; LinkedIn moves on a moment later.
            settle: url => (codeSent ? restricted : url),
         })

         await expect(
            validator.validate(
               session,
               input({
                  password: 'hunter2',
                  totpSecret: TOTP_SECRET,
               })
            )
         ).resolves.toMatchObject({
            outcome: 'BLOCKED',
            message: expect.stringMatching(/restricted/i),
         })
      })

      it('should not call a code wrong while the page is still on its way to the feed', async () => {
         const code = totpCode(TOTP_SECRET, NOW)
         let codeSent = false
         const { session } = fakeSession({
            ...site({
               password: 'hunter2',
               challenge: 'code',
               code,
            }),
            submit: (selector, typed, url) => {
               if (selector === SELECTORS.codeSubmit) {
                  codeSent = true

                  return checkpoint
               }

               return typed[SELECTORS.password] === 'hunter2' ? checkpoint : url
            },
            // The code page is still shown right after the submit; the feed comes a moment later.
            settle: url => (codeSent ? feed : url),
         })

         await expect(
            validator.validate(
               session,
               input({
                  password: 'hunter2',
                  totpSecret: TOTP_SECRET,
               })
            )
         ).resolves.toMatchObject({ outcome: 'VALID' })
      })
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
            [SELECTORS.username]: 'ada@work.com',
            [SELECTORS.password]: 'hunter2',
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
      it('should type the email and the password once and send it with Enter, so no button text matters', async () => {
         const { session, typed } = fakeSession(site({ password: 'hunter2' }))

         await expect(validator.validate(session, input({ password: 'hunter2' }))).resolves.toEqual({
            outcome: 'VALID',
            cookies: [feedCookies[0]],
         })
         expect(session.fill).toHaveBeenCalledTimes(2)
         expect(session.press).toHaveBeenCalledWith('Enter')
         expect(session.click).not.toHaveBeenCalled()
         expect(typed).toEqual({
            [SELECTORS.username]: 'ada@work.com',
            [SELECTORS.password]: 'hunter2',
         })
      })

      it('should be VALID without typing when the login page already shows the feed', async () => {
         const { session } = fakeSession({
            ...site(),
            load: () => feed,
         })

         const result = await validator.validate(session, input({ password: 'hunter2' }))

         expect(result).toMatchObject({ outcome: 'VALID' })
         expect(session.fill).not.toHaveBeenCalled()
      })

      it('should answer INVALID_CREDENTIALS for a wrong password, and never try a second time', async () => {
         const { session } = fakeSession(site({ password: 'right' }))

         await expect(validator.validate(session, input({ password: 'wrong' }))).resolves.toMatchObject({
            outcome: 'INVALID_CREDENTIALS',
            message: expect.stringMatching(/email or password/i),
         })
         expect(session.fill).toHaveBeenCalledTimes(2)
         expect(session.press).toHaveBeenCalledTimes(1)
         expect(session.click).not.toHaveBeenCalled()
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
         expect(typed[SELECTORS.codeField]).toBe(code)
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
         expect(session.press).toHaveBeenCalledTimes(1)
         expect(session.click).toHaveBeenCalledTimes(1)
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

         const result = await validator.validate(session, input({ password: 'hunter2' }))

         expect(result).toMatchObject({ outcome: 'ERROR' })
      })

      it('should report ERROR, without the raw error, when LinkedIn will not load a page', async () => {
         const { session } = fakeSession(site())

         session.goto.mockRejectedValue(new Error('The site answered 999 TOPSECRETDETAIL'))

         const verdict = await validator.validate(session, input({ password: 'hunter2' }))

         expect(verdict).toMatchObject({ outcome: 'ERROR' })
         expect(JSON.stringify(verdict)).not.toContain('TOPSECRETDETAIL')
      })
   })

   describe('on the "Welcome back" page of a remembered account (recorded 2026-10-18)', () => {
      const welcome = `${BASE}/login?welcome`

      // /login shows a remembered account with only a password box; another account leads to `afterSwitch`.
      const remembered = (shown: string, afterSwitch = login): Script => {
         const base = site({ password: 'hunter2' })

         return {
            ...base,
            load: target => (target === login ? welcome : base.load(target)),
            submit: (selector, typed, url) =>
               selector === SELECTORS.otherAccount ? afterSwitch : base.submit(selector, typed, url),
            elements: url => (url === welcome ? [SELECTORS.password, rememberedAccount(shown)] : base.elements(url)),
         }
      }

      it('should type only the password when the page remembers this account', async () => {
         const { session, typed } = fakeSession(remembered('ada@work.com'))
         const verdict = await validator.validate(session, input({ password: 'hunter2' }))

         expect(verdict).toMatchObject({ outcome: 'VALID' })
         expect(typed).toEqual({ [SELECTORS.password]: 'hunter2' })
      })

      it('should switch to another account and use the whole form when the page remembers someone else', async () => {
         const { session, typed } = fakeSession(remembered('bob@other.com'))
         const verdict = await validator.validate(session, input({ password: 'hunter2' }))

         expect(verdict).toMatchObject({ outcome: 'VALID' })
         expect(session.click).toHaveBeenCalledWith(SELECTORS.otherAccount)
         expect(typed).toEqual({
            [SELECTORS.username]: 'ada@work.com',
            [SELECTORS.password]: 'hunter2',
         })
      })

      it('should type nothing and report ERROR when switching account still shows no email field', async () => {
         const { session } = fakeSession(remembered('bob@other.com', welcome))

         await expect(validator.validate(session, input({ password: 'hunter2' }))).resolves.toMatchObject({
            outcome: 'ERROR',
            message: expect.stringMatching(/does not understand/i),
         })
         expect(session.fill).not.toHaveBeenCalled()
      })
   })

   describe('rememberedAccount', () => {
      it('should match the masked email by its first letter and domain, whatever the case', () => {
         const selector = rememberedAccount('Ada.Lovelace+x@Work.co.uk')

         expect(selector).toContain(String.raw`^\\s*a\\*+@work\\.co\\.uk\\s*$`)
         expect(selector).toMatch(/"i"\):visible$/)
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

   // Recorded 2026-10-18: the code is asked for in a dialog over /login, with no button; the page sends it after the last
   // digit. LinkedIn may then show its ads consent page before the feed.
   describe('with the two-step code in a dialog', () => {
      const consent = `${BASE}/connect-services/ads_experience/?session_redirect=${encodeURIComponent(feed)}`
      const code = totpCode(TOTP_SECRET, NOW)
      const credentials = {
         password: 'hunter2',
         totpSecret: TOTP_SECRET,
      }

      // `sendsItself`: the page sends the code after the last digit; otherwise only Enter does. `lingers`: how many more
      // looks the dialog stays on screen after a right code. `then`: where a right code leads.
      const dialogSite = (rules: {
         right?: string
         sendsItself?: boolean
         lingers?: number
         then?: 'feed' | 'consent'
         acceptShown?: boolean
      }): Script => {
         let sent = false
         let looks = rules.lingers ?? 0
         const after = rules.then === 'consent' ? consent : feed
         const right = (typed: Record<string, string>) => typed[SELECTORS.codeField] === (rules.right ?? code)

         return {
            load: target => (target.startsWith(feed) ? login : target),
            submit: (selector, typed, url) => {
               if (selector === SELECTORS.consentAccept) {
                  return feed
               }

               if (url === login && typed[SELECTORS.codeField] !== undefined) {
                  sent = right(typed)

                  return login
               }

               return typed[SELECTORS.password] === 'hunter2' ? login : `${BASE}/somewhere`
            },
            type: (_selector, value, url) => {
               sent = Boolean(rules.sendsItself) && value === (rules.right ?? code)

               return url
            },
            settle: url => {
               if (url !== login || !sent) {
                  return url
               }

               looks -= 1

               return looks < 0 ? after : login
            },
            elements: url => {
               if (url === login) {
                  return sent && looks < 0 ? [] : [SELECTORS.username, SELECTORS.password, SELECTORS.codeDialog]
               }

               return url === consent && rules.acceptShown !== false ? [SELECTORS.consentAccept] : []
            },
         }
      }

      it('should type the code into the dialog that has no button, and sign in once the page sends it', async () => {
         const { session, typed } = fakeSession(dialogSite({ sendsItself: true }))

         await expect(validator.validate(session, input(credentials))).resolves.toMatchObject({ outcome: 'VALID' })
         expect(typed[SELECTORS.codeField]).toBe(code)
         expect(session.type).toHaveBeenCalledTimes(1)
         expect(session.click).not.toHaveBeenCalledWith(SELECTORS.codeSubmit)
      })

      it('should not call the code wrong while the dialog is still on screen after it was sent', async () => {
         const { session } = fakeSession(
            dialogSite({
               sendsItself: true,
               lingers: 3,
            })
         )

         await expect(validator.validate(session, input(credentials))).resolves.toMatchObject({ outcome: 'VALID' })
         expect(session.type).toHaveBeenCalledTimes(1)
      })

      it('should press Enter once when the dialog does not send the code by itself', async () => {
         const { session } = fakeSession(dialogSite({ sendsItself: false }))

         await expect(validator.validate(session, input(credentials))).resolves.toMatchObject({ outcome: 'VALID' })
         expect(session.press).toHaveBeenCalledTimes(2)
         expect(session.type).toHaveBeenCalledTimes(1)
      })

      it('should call a code wrong after one try when the dialog stays, so a wrong key cannot lock the account', async () => {
         const { session } = fakeSession(
            dialogSite({
               right: '000000',
               sendsItself: true,
            })
         )

         await expect(validator.validate(session, input(credentials))).resolves.toMatchObject({
            outcome: 'NEEDS_REAUTH',
            message: expect.stringMatching(/did not accept the two-step code/i),
         })
         expect(session.type).toHaveBeenCalledTimes(1)
      })

      it('should accept the ads consent page LinkedIn shows after the code, and be signed in', async () => {
         const { session } = fakeSession(
            dialogSite({
               sendsItself: true,
               then: 'consent',
            })
         )

         await expect(validator.validate(session, input(credentials))).resolves.toMatchObject({ outcome: 'VALID' })
         expect(session.click).toHaveBeenCalledWith(SELECTORS.consentAccept)
      })

      it('should still be signed in when the consent page shows no Accept button', async () => {
         const { session } = fakeSession(
            dialogSite({
               sendsItself: true,
               then: 'consent',
               acceptShown: false,
            })
         )

         await expect(validator.validate(session, input(credentials))).resolves.toMatchObject({ outcome: 'VALID' })
         expect(session.click).not.toHaveBeenCalledWith(SELECTORS.consentAccept)
      })

      it('should get past the consent page when the saved token leads there, without typing', async () => {
         const { session } = fakeSession({
            load: target => (target.startsWith(feed) ? consent : target),
            submit: selector => (selector === SELECTORS.consentAccept ? feed : consent),
            elements: url => (url === consent ? [SELECTORS.consentAccept] : []),
         })

         const verdict = await validator.validate(session, input({ session: `li_at=${LI_AT}` }))

         expect(verdict).toMatchObject({ outcome: 'VALID' })
         expect(session.fill).not.toHaveBeenCalled()
         expect(session.click).toHaveBeenCalledWith(SELECTORS.consentAccept)
      })
   })
})
