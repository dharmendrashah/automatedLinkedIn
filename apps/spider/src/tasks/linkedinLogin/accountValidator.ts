import { SECURITY_CHECK_MESSAGE, extractLiAt } from '@automatedLinkedIn/contracts'

import { type SessionCookie } from '../../types'

import { type LoginSession } from '../../scraping/driver'
import { type Credentials } from '../credentials'
import { totpCode } from './totp'

export type Verdict =
   | {
        outcome: 'VALID'
        cookies: SessionCookie[]
     }
   | {
        outcome: Failure
        message: string
     }

type Failure = 'INVALID_CREDENTIALS' | 'NEEDS_REAUTH' | 'ERROR' | 'BLOCKED'

// The only sentences a verdict ever carries. Brain shows them to the owner, so they say what to do and never quote
// the page or a secret.
const MESSAGES = {
   tokenExpired: 'The saved browser token is no longer accepted by LinkedIn. Add your password or a new token.',
   badPassword: 'LinkedIn did not accept the email or password.',
   needsCode: 'LinkedIn asked for a two-step code and no two-step key is stored.',
   badCode: 'LinkedIn did not accept the two-step code.',
   securityCheck: SECURITY_CHECK_MESSAGE,
   restricted: 'LinkedIn restricted this account. Open LinkedIn yourself to see why.',
   passwordOff: 'Password sign-in is switched off on this worker, and no browser token is stored.',
   nothingStored: 'No password or browser token is stored.',
   unexpected: 'LinkedIn showed a page the check does not understand.',
   typing: 'The sign-in form did not keep what was typed, so nothing was sent. Try again.',
   blocked: 'LinkedIn did not let the check load a page.',
} as const

// The page elements the login relies on. LinkedIn changes them from time to time; keeping them in one place is
// what makes that a one-line fix. The sign-in page was redesigned (recorded 2026-10-15): inputs with generated ids, the
// page in the language of the browser, and the whole form twice in the page with only one copy shown (a selector that
// takes the first match lands on the hidden one). So nothing here relies on an id or a word: the fields are found by
// what they are (the autofill names `username` and `current-password`) and only while they are visible. The password is
// sent with the first button below it (a button, a submit input or something with the button role, never found by its
// label), because the page ignores the Enter key and has no form to send (recordings of 2026-10-15). Enter is only the
// fallback when the page shows no button. The two-step code page has ids of its own.
// A checkbox or a switch built from a button is not the sign-in button.
const BUTTON = ':not([role="checkbox"]):not([role="switch"]):visible:below(input[type="password"]:visible)'

// A frame that only a challenge has. The badge of an invisible captcha is in a frame too, so it is not in here.
const CHALLENGE = '#captcha-internal, iframe[src*="bframe" i], iframe[src*="arkose" i], iframe[src*="/checkpoint/" i]'

// The old two-step page: its own ids and names, and a hidden recovery code form with the same ones.
const PIN = 'input[name="pin"]:visible, #input__phone_verification_pin:visible'

// Recorded 2026-10-18: the code box is a dialog over /login with one input and no button; the page sends the code after
// the last digit. Nothing in it has a stable id, so the input is found by what it is, most specific first.
const CODE_DIALOG = [
   'input[autocomplete="one-time-code"]',
   'input[inputmode="numeric"]',
   'input[type="tel"]',
   'input[type="number"]',
   'input[type="text"]',
]
   .map(input => `dialog[open] ${input}:visible`)
   .join(', ')

export const SELECTORS = {
   username: 'input[autocomplete~="username"]:visible, input[type="email"]:visible, #username >> nth=0',
   password: 'input[type="password"]:visible, #password >> nth=0',
   submit: `button${BUTTON}, input[type="submit"]${BUTTON}, [role="button"]${BUTTON} >> nth=0`,
   loginErrors: ['#error-for-username', '#error-for-password'],
   codeInput: `${PIN}, ${CODE_DIALOG}`,
   codeField: `${PIN}, ${CODE_DIALOG} >> nth=0`,
   codeDialog: CODE_DIALOG,
   codeSubmit: '#two-step-submit-button:visible, button[type="submit"]:visible >> nth=0',
   // Only a button inside the dialog: the sign-in button behind it would send the password again.
   dialogSubmit: 'dialog[open] button[type="submit"]:visible >> nth=0',
   // The ads consent page LinkedIn may show after a sign-in (recorded 2026-10-18); the owner chose to accept it.
   consentAccept: 'button:has-text("Accept"):visible >> nth=0',
   challenge: CHALLENGE,
   // Read only once nothing else explains the page: it also takes the plain captcha frames.
   captcha: `${CHALLENGE}, iframe[src*="captcha" i]:visible, iframe[title*="captcha" i]:visible, [data-sitekey]:visible`,
}

// How long to look for an element that may or may not appear after a page loads.
const LOOK_MS = 1500

// After a submit the sign-in page can keep its address for a while: a spinner, then LinkedIn's own quick security check
// ("Kurze Sicherheitspruefung"), then a move to the feed or a challenge. It is read again every few seconds until it moves
// on, shows an error or asks for a code, for at most this long.
const OUTCOME_WAIT_MS = 30_000
const OUTCOME_POLL_MS = 2000
const POLL_LOOK_MS = 250

// How long the code dialog gets to send the code by itself before Enter is pressed once.
const AUTO_SUBMIT_MS = 3000

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

type PageKind = 'feed' | 'checkpoint' | 'login' | 'restricted' | 'consent' | 'other'

export const kindOf = (url: string): PageKind => {
   if (!URL.canParse(url)) {
      return 'other'
   }

   const { pathname } = new URL(url)

   if (pathname.startsWith('/feed')) {
      return 'feed'
   }

   if (pathname.startsWith('/checkpoint')) {
      return 'checkpoint'
   }

   if (pathname.startsWith('/connect-services/')) {
      return 'consent'
   }

   if (pathname.startsWith('/flagship-web/login/login-restriction')) {
      return 'restricted'
   }

   return /^\/(flagship-web\/)?(login|uas\/login|authwall|signup)/.test(pathname) ? 'login' : 'other'
}

export type ValidatorOptions = {
   baseUrl: string
   // full: token first, then the password (and a two-step code). session: only the token.
   mode: 'full' | 'session'
   // Waits the politeness gap for a host before the next step.
   pause: (host: string) => Promise<void>
   // A plain wait, for polling a page that is still working. Tests pass one that returns at once.
   sleep?: (ms: number) => Promise<void>
   // Only cookies for allowed hosts are handed back.
   allowsCookieDomain: (domain: string) => boolean
   now?: () => number
}

type Input = {
   email: string
   credentials: Credentials
   // The account's language as a locale (en-US). LinkedIn picks a language from the address it sees, whatever the browser
   // asks for (recordings of 2026-10-15: a German page for an en-US browser), so the choice is sent as its own cookie.
   language?: string
}

// Checks LinkedIn credentials by signing in once. It signs in with what is stored and tries nothing twice: a wrong
// password or a wrong code is a result, because repeating it is how accounts get locked. Security checks it cannot
// pass with the stored secrets (a puzzle, an e-mailed code) are reported, never solved.
export class AccountValidator {
   private readonly host: string

   private readonly cookieDomain: string

   public constructor(private readonly options: ValidatorOptions) {
      const { hostname } = new URL(options.baseUrl)

      this.host = hostname
      this.cookieDomain = hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com') ? '.linkedin.com' : hostname
   }

   public async validate(session: LoginSession, { email, credentials, language }: Input): Promise<Verdict> {
      try {
         if (language) {
            await session.addCookies([
               {
                  name: 'lang',
                  value: `v=2&lang=${language.toLowerCase()}`,
                  domain: this.cookieDomain,
                  path: '/',
                  secure: this.options.baseUrl.startsWith('https:'),
               },
            ])
         }

         return await this.run(session, email, credentials)
      } catch {
         // The page or the browser failed; what exactly stays out of the verdict.
         return {
            outcome: 'ERROR',
            message: MESSAGES.blocked,
         }
      }
   }

   // Looks again, once the owner has finished a security check themselves. The page they left the browser on is read as it
   // is: a finished captcha moves it on by itself, and loading another page would cut that short or ask for the check
   // again. The feed is valid; the two-step code page is answered once with the stored two-step key and the next page is
   // waited for. Only a browser that cannot say where it is (no page yet) is asked for the feed. The answer is the same
   // sentences as for a first sign-in.
   public async recheck(session: LoginSession, { totpSecret }: Credentials): Promise<Verdict> {
      try {
         await this.options.pause(this.host)

         const here = await this.afterSubmit(session, await this.settled(session, ''))
         const landed = URL.canParse(here) ? here : await session.goto(`${this.options.baseUrl}/feed/`)

         // Back on the sign-in page: the owner did not get through.
         return kindOf(landed) === 'login'
            ? this.fail('NEEDS_REAUTH', MESSAGES.securityCheck)
            : await this.settle(session, landed, totpSecret)
      } catch {
         return this.fail('ERROR', MESSAGES.blocked)
      }
   }

   private async run(session: LoginSession, email: string, credentials: Credentials): Promise<Verdict> {
      const token = this.tokenOf(credentials)
      const { password } = credentials

      if (!token && !password) {
         return this.fail('NEEDS_REAUTH', MESSAGES.nothingStored)
      }

      if (token) {
         const verdict = await this.tryToken(session, token)

         if (verdict) {
            return verdict
         }
      }

      // Here the token is missing or was refused, and either there is no password or password sign-in is off.
      if (!password) {
         return this.fail('NEEDS_REAUTH', MESSAGES.tokenExpired)
      }

      if (this.options.mode === 'session') {
         return this.fail('NEEDS_REAUTH', token ? MESSAGES.tokenExpired : MESSAGES.passwordOff)
      }

      return this.signIn(session, email, credentials)
   }

   private tokenOf({ session }: Credentials) {
      if (!session) {
         return undefined
      }

      try {
         return extractLiAt(session)
      } catch {
         return undefined
      }
   }

   // Undefined means "the token did not work, try the next way".
   private async tryToken(session: LoginSession, token: string): Promise<Verdict | undefined> {
      await session.addCookies([
         {
            name: 'li_at',
            value: token,
            domain: this.cookieDomain,
            path: '/',
            secure: this.options.baseUrl.startsWith('https:'),
            httpOnly: true,
         },
      ])
      await this.options.pause(this.host)

      const landed = await session.goto(`${this.options.baseUrl}/feed/`)
      const kind = kindOf(landed)

      if (kind === 'feed') {
         return this.valid(session)
      }

      if (kind === 'consent') {
         return this.pastConsent(session)
      }

      if (kind === 'restricted') {
         return this.fail('BLOCKED', MESSAGES.restricted)
      }

      return kind === 'checkpoint' ? this.fail('NEEDS_REAUTH', MESSAGES.securityCheck) : undefined
   }

   private async signIn(session: LoginSession, email: string, { password, totpSecret }: Credentials): Promise<Verdict> {
      await this.options.pause(this.host)

      let landed = await session.goto(`${this.options.baseUrl}/login`)

      if (kindOf(landed) === 'feed') {
         return this.valid(session)
      }

      try {
         await session.fill(SELECTORS.username, email)
         await session.fill(SELECTORS.password, password ?? '')
      } catch {
         // The form did not keep what was typed; nothing was sent, which a wrong password or e-mail would count against the account.
         return this.fail('ERROR', MESSAGES.typing)
      }

      await this.options.pause(this.host)

      landed = await this.afterSubmit(session, await this.submit(session))

      return this.settle(session, landed, totpSecret)
   }

   // The button under the password; the Enter key only when the page shows none.
   private async submit(session: LoginSession) {
      return (await session.exists(SELECTORS.submit, LOOK_MS))
         ? session.click(SELECTORS.submit)
         : session.press('Enter')
   }

   // Reads where a sign-in ended up, answering the two-step code once if LinkedIn asks for it.
   private async settle(session: LoginSession, first: string, totpSecret: string | undefined): Promise<Verdict> {
      let landed = first
      let codeSent = false

      for (let step = 0; step < 3; step += 1) {
         const kind = kindOf(landed)

         if (kind === 'feed') {
            return this.valid(session)
         }

         if (kind === 'consent') {
            return this.pastConsent(session)
         }

         if (kind === 'restricted') {
            return this.fail('BLOCKED', MESSAGES.restricted)
         }

         // LinkedIn shows a wrong password on the login page or on /checkpoint/lg/login-submit.
         if (!codeSent && (await this.anyExists(SELECTORS.loginErrors, session))) {
            return this.fail('INVALID_CREDENTIALS', MESSAGES.badPassword)
         }

         if (await session.exists(SELECTORS.codeInput, LOOK_MS)) {
            if (codeSent) {
               return this.fail('NEEDS_REAUTH', MESSAGES.badCode)
            }

            if (!totpSecret) {
               return this.fail('NEEDS_REAUTH', MESSAGES.needsCode)
            }

            landed = await this.afterSubmit(session, await this.sendCode(session, landed, totpSecret), true)
            codeSent = true

            continue
         }

         // Read last, so a captcha badge on a plain page never hides an error or a code prompt.
         return kind === 'checkpoint' || (await session.exists(SELECTORS.captcha, LOOK_MS))
            ? this.fail('NEEDS_REAUTH', MESSAGES.securityCheck)
            : this.fail('ERROR', MESSAGES.unexpected)
      }

      return this.fail('ERROR', MESSAGES.unexpected)
   }

   // Types the code once, digit by digit, and sends it the way the page allows: its button, or for the dialog that has
   // none, the page itself after the last digit, with Enter pressed once if it has not moved on. Never typed twice.
   private async sendCode(session: LoginSession, landed: string, totpSecret: string) {
      const inDialog = await session.exists(SELECTORS.codeDialog, LOOK_MS)
      const button = inDialog ? SELECTORS.dialogSubmit : SELECTORS.codeSubmit

      await session.type(SELECTORS.codeField, totpCode(totpSecret, (this.options.now ?? Date.now)()))
      await this.options.pause(this.host)

      if (await session.exists(button, LOOK_MS)) {
         return session.click(button)
      }

      await (this.options.sleep ?? wait)(AUTO_SUBMIT_MS)

      const now = await this.settled(session, landed)

      return kindOf(now) === 'login' && (await session.exists(SELECTORS.codeDialog, POLL_LOOK_MS))
         ? session.press('Enter')
         : now
   }

   // The ads consent page LinkedIn may show once signed in: Accept, as the owner chose, then the feed. The account is
   // signed in either way, so a page with no Accept button, or one that does not move on, still counts.
   private async pastConsent(session: LoginSession): Promise<Verdict> {
      try {
         if (await session.exists(SELECTORS.consentAccept, LOOK_MS)) {
            await this.options.pause(this.host)
            await this.settled(session, await session.click(SELECTORS.consentAccept))
         }
      } catch {
         // Signed in already; the consent choice can wait for the next visit.
      }

      return this.valid(session)
   }

   // LinkedIn answers a submit on the same page and moves on a moment later, so the page is read once it stops moving.
   private async settled(session: LoginSession, landed: string) {
      return session.settled ? session.settled() : landed
   }

   // Where the browser is once the submit has played out: still on the sign-in page only if LinkedIn shows an error or asks
   // for a code there, or has not moved on after the wait. Once a code was sent, its dialog can stay a moment while LinkedIn
   // checks it, so it is not an answer then.
   private async afterSubmit(session: LoginSession, first: string, codeSent = false) {
      const answers = [...SELECTORS.loginErrors, ...(codeSent ? [] : [SELECTORS.codeInput]), SELECTORS.challenge].join(
         ', '
      )
      const sleep = this.options.sleep ?? wait
      let landed = await this.settled(session, first)

      for (let waited = 0; waited < OUTCOME_WAIT_MS && kindOf(landed) === 'login'; waited += OUTCOME_POLL_MS) {
         if (await session.exists(answers, POLL_LOOK_MS)) {
            break
         }

         await sleep(OUTCOME_POLL_MS)
         landed = await this.settled(session, landed)
      }

      return landed
   }

   private async anyExists(selectors: string[], session: LoginSession) {
      for (const selector of selectors) {
         if (await session.exists(selector, LOOK_MS)) {
            return true
         }
      }

      return false
   }

   private async valid(session: LoginSession): Promise<Verdict> {
      const cookies = await session.cookies()

      return {
         outcome: 'VALID',
         cookies: cookies.filter(({ domain }) => this.options.allowsCookieDomain(domain)),
      }
   }

   private fail(outcome: Failure, message: string): Verdict {
      return {
         outcome,
         message,
      }
   }
}
