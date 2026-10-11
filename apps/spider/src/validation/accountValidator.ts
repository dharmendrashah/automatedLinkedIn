import { extractLiAt } from '@automatedLinkedIn/contracts'

import { type SessionCookie } from '../types'

import { type LoginSession } from '../scraping/driver'
import { type Credentials } from './credentials'
import { totpCode } from './totp'

export type Verdict =
   | {
        outcome: 'VALID'
        cookies: SessionCookie[]
     }
   | {
        outcome: 'INVALID_CREDENTIALS' | 'NEEDS_REAUTH' | 'ERROR'
        message: string
     }

// The only sentences a verdict ever carries. Brain shows them to the owner, so they say what to do and never quote
// the page or a secret.
const MESSAGES = {
   tokenExpired: 'The saved browser token is no longer accepted by LinkedIn. Add your password or a new token.',
   badPassword: 'LinkedIn did not accept the email or password.',
   needsCode: 'LinkedIn asked for a two-step code and no two-step key is stored.',
   badCode: 'LinkedIn did not accept the two-step code.',
   securityCheck: 'LinkedIn asked for a security check that you have to complete yourself.',
   passwordOff: 'Password sign-in is switched off on this worker, and no browser token is stored.',
   nothingStored: 'No password or browser token is stored.',
   unexpected: 'LinkedIn showed a page the check does not understand.',
   blocked: 'LinkedIn did not let the check load a page.',
} as const

// The page elements the login relies on. LinkedIn changes them from time to time; keeping them in one place is
// what makes that a one-line fix.
const SELECTORS = {
   username: '#username',
   password: '#password',
   submit: 'button[type="submit"]',
   loginErrors: ['#error-for-username', '#error-for-password'],
   codeInput: 'input[name="pin"]',
   codeSubmit: 'button[type="submit"]',
}

// How long to look for an element that may or may not appear after a page loads.
const LOOK_MS = 1500

type PageKind = 'feed' | 'checkpoint' | 'login' | 'other'

const kindOf = (url: string): PageKind => {
   const { pathname } = new URL(url)

   if (pathname.startsWith('/feed')) {
      return 'feed'
   }

   if (pathname.startsWith('/checkpoint')) {
      return 'checkpoint'
   }

   return /^\/(login|uas\/login|authwall|signup)/.test(pathname) ? 'login' : 'other'
}

export type ValidatorOptions = {
   baseUrl: string
   // full: token first, then the password (and a two-step code). session: only the token.
   mode: 'full' | 'session'
   // Waits the politeness gap for a host before the next step.
   pause: (host: string) => Promise<void>
   // Only cookies for allowed hosts are handed back.
   allowsCookieDomain: (domain: string) => boolean
   now?: () => number
}

type Input = {
   email: string
   credentials: Credentials
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

   public async validate(session: LoginSession, { email, credentials }: Input): Promise<Verdict> {
      try {
         return await this.run(session, email, credentials)
      } catch {
         // The page or the browser failed; what exactly stays out of the verdict.
         return {
            outcome: 'ERROR',
            message: MESSAGES.blocked,
         }
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

      return kind === 'checkpoint' ? this.fail('NEEDS_REAUTH', MESSAGES.securityCheck) : undefined
   }

   private async signIn(session: LoginSession, email: string, { password, totpSecret }: Credentials): Promise<Verdict> {
      await this.options.pause(this.host)

      let landed = await session.goto(`${this.options.baseUrl}/login`)

      if (kindOf(landed) === 'feed') {
         return this.valid(session)
      }

      await session.fill(SELECTORS.username, email)
      await session.fill(SELECTORS.password, password ?? '')
      await this.options.pause(this.host)

      landed = await session.click(SELECTORS.submit)

      let codeSent = false

      for (let step = 0; step < 3; step += 1) {
         if (kindOf(landed) === 'feed') {
            return this.valid(session)
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

            await session.fill(SELECTORS.codeInput, totpCode(totpSecret, (this.options.now ?? Date.now)()))
            await this.options.pause(this.host)

            landed = await session.click(SELECTORS.codeSubmit)
            codeSent = true

            continue
         }

         return kindOf(landed) === 'checkpoint'
            ? this.fail('NEEDS_REAUTH', MESSAGES.securityCheck)
            : this.fail('ERROR', MESSAGES.unexpected)
      }

      return this.fail('ERROR', MESSAGES.unexpected)
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

   private fail(outcome: 'INVALID_CREDENTIALS' | 'NEEDS_REAUTH' | 'ERROR', message: string): Verdict {
      return {
         outcome,
         message,
      }
   }
}
