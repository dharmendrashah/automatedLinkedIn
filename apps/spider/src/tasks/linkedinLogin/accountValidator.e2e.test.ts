import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CamoufoxDriver } from '../../scraping/camoufoxDriver'
import { HostPolicy } from '../../scraping/policy'
import { HostRateLimiter } from '../../scraping/rateLimiter'
import { AccountValidator } from './accountValidator'
import { totpCode } from './totp'

// Runs a real Camoufox against a local stand-in for LinkedIn's sign-in: a login form, a feed, a wrong password that
// stays on a /checkpoint/ path, and a two-step page. It proves the form handling in a real browser. It cannot prove
// anything about the real LinkedIn pages. Needs the browser build: `pnpm exec camoufox fetch`.

const TOKEN = 'AQEDARz1x2aBcD3eFgHiJkLmNoPqRsTuVwXyZ0123456789-_abcdefghijklmnopqrstuvwxyz'
const PASSWORD = 'hunter2'
const TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`

const readBody = (request: NodeJS.ReadableStream) =>
   new Promise<URLSearchParams>(resolve => {
      let text = ''

      request.on('data', chunk => (text += String(chunk)))
      request.on('end', () => resolve(new URLSearchParams(text)))
   })

const signedIn = (cookie = '') => cookie.includes('signed=yes') || cookie.includes(`li_at=${TOKEN}`)

let server: Server
let origin: string
// The new LinkedIn page has no form: Enter does nothing and a button sends what was typed.
let noForm = false

// A checkbox made of a button, the sign-in button, then a button of the footer.
const noFormPage =
   '<div><input id="u1" autocomplete="username"></div><div><input id="p1" type="password" autocomplete="current-password"></div><div><a href="#">Forgot</a></div><div><button type="button" role="checkbox" aria-checked="true">Keep</button></div><div><button type="button" id="go">Go</button></div><div><button type="button">Language</button></div><script>document.getElementById("go").onclick=()=>{location.href="/spa-signin?p="+encodeURIComponent(document.getElementById("p1").value)}</script>'

// LinkedIn's two-step page also holds a hidden recovery code form with the same ids and names.
const twoStepPage =
   '<form method="post" action="/checkpoint/challenge/abc"><input name="pin" id="input__phone_verification_pin" maxlength="6"><button type="submit" id="two-step-submit-button">Verify</button></form><div style="display:none"><form method="post" action="/checkpoint/challenge/abc"><input name="pin" id="input__phone_verification_pin" maxlength="8"><button type="submit" id="two-step-submit-button">Recover</button></form></div>'

beforeAll(async () => {
   server = createServer(async (request, response) => {
      const { pathname } = new URL(request.url ?? '/', 'http://localhost')
      const cookie = request.headers.cookie ?? ''
      const html = (body: string, headers: Record<string, string> = {}) => {
         response.writeHead(200, {
            'content-type': 'text/html',
            ...headers,
         })
         response.end(page(body))
      }
      const redirect = (to: string, headers: Record<string, string> = {}) => {
         response.writeHead(302, {
            location: to,
            ...headers,
         })
         response.end()
      }

      if (pathname.startsWith('/feed')) {
         return signedIn(cookie) ? html('<h1>feed</h1>') : redirect('/login')
      }

      if (pathname === '/spa-signin') {
         return new URL(request.url ?? '/', 'http://localhost').searchParams.get('p') === PASSWORD
            ? redirect('/feed/', { 'set-cookie': 'signed=yes; Path=/' })
            : html('<p>no</p>')
      }

      if (pathname === '/login' && request.method === 'GET') {
         if (noForm && !signedIn(cookie)) {
            return html(noFormPage)
         }

         return signedIn(cookie)
            ? redirect('/feed/')
            : html(
                 '<form method="post" action="/login"><input id="username" name="u"><input id="password" name="p" type="password"><button type="submit">Sign in</button></form>'
              )
      }

      if (pathname === '/login' && request.method === 'POST') {
         const form = await readBody(request)

         if (form.get('p') !== PASSWORD) {
            // LinkedIn answers a wrong password on a /checkpoint/ path, with the message on the page.
            return redirect('/checkpoint/lg/login-submit')
         }

         return form.get('u')?.startsWith('twostep')
            ? redirect('/checkpoint/challenge/abc')
            : redirect('/feed/', { 'set-cookie': 'signed=yes; Path=/' })
      }

      if (pathname === '/checkpoint/lg/login-submit') {
         return html('<p id="error-for-password">Wrong password</p>')
      }

      if (pathname === '/checkpoint/challenge/abc' && request.method === 'GET') {
         return html(twoStepPage)
      }

      if (pathname === '/checkpoint/challenge/abc' && request.method === 'POST') {
         const form = await readBody(request)

         return form.get('pin') === totpCode(TOTP_SECRET, Date.now())
            ? redirect('/feed/', { 'set-cookie': 'signed=yes; Path=/' })
            : html('<form method="post"><input name="pin"><button type="submit">Verify</button></form>')
      }

      response.writeHead(404)
      response.end()
   })

   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

const run = async (email: string, credentials: Record<string, string>) => {
   const policy = HostPolicy.fromList('127.0.0.1')
   const driver = new CamoufoxDriver({
      actionTimeoutMs: 10_000,
      isAllowedNavigation: url => policy.allowsUrl(url),
   })
   const validator = new AccountValidator({
      baseUrl: origin,
      mode: 'full',
      pause: host => new HostRateLimiter(0).wait(host),
      allowsCookieDomain: domain => policy.allowsCookieDomain(domain),
   })
   const session = await driver.open()

   try {
      return await validator.validate(session, {
         email,
         credentials,
      })
   } finally {
      await session.close()
   }
}

describe('AccountValidator in a real browser, against a stand-in for LinkedIn', () => {
   it('should send the password with the button when the page has no form and ignores Enter', async () => {
      noForm = true

      try {
         await expect(run('ada@work.com', { password: PASSWORD })).resolves.toMatchObject({ outcome: 'VALID' })
      } finally {
         noForm = false
      }
   })

   it('should accept a good browser token and hand back the session cookies', async () => {
      const verdict = await run('ada@work.com', { session: `li_at=${TOKEN}` })

      expect(verdict.outcome).toBe('VALID')
      expect(verdict.outcome === 'VALID' && verdict.cookies.some(({ name }) => name === 'li_at')).toBe(true)
   })

   it('should sign in with the password when the token is refused', async () => {
      const verdict = await run('ada@work.com', {
         session: 'li_at=AQEDARz1x2aBcD3eFgHiJkLmNoPqRsTuVwXyZ0123456789-_BADBADBADBADBADBADBADBAD',
         password: PASSWORD,
      })

      expect(verdict.outcome).toBe('VALID')
      expect(verdict.outcome === 'VALID' && verdict.cookies.some(({ name }) => name === 'signed')).toBe(true)
   })

   it('should report a wrong password, which LinkedIn shows on a /checkpoint/ page', async () => {
      const result = await run('ada@work.com', { password: 'not-it' })

      expect(result).toMatchObject({ outcome: 'INVALID_CREDENTIALS' })
   })

   it('should answer the two-step page with a code from the stored key', async () => {
      await expect(
         run('twostep@work.com', {
            password: PASSWORD,
            totpSecret: TOTP_SECRET,
         })
      ).resolves.toMatchObject({ outcome: 'VALID' })
   })

   it('should report a wrong two-step key after one try', async () => {
      await expect(
         run('twostep@work.com', {
            password: PASSWORD,
            totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
         })
      ).resolves.toMatchObject({ outcome: 'NEEDS_REAUTH' })
   })

   it('should say a code is needed when none is stored', async () => {
      await expect(run('twostep@work.com', { password: PASSWORD })).resolves.toMatchObject({
         outcome: 'NEEDS_REAUTH',
         message: expect.stringMatching(/two-step/i),
      })
   })
})
