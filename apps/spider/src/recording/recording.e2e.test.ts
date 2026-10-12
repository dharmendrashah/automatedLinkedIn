import { readFile } from 'node:fs/promises'
import { type Server, type ServerResponse, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CamoufoxDriver } from '../scraping/camoufoxDriver'
import { HostPolicy } from '../scraping/policy'
import { HostRateLimiter } from '../scraping/rateLimiter'
import { AccountValidator } from '../validation/accountValidator'
import { RecordedSession } from './recordedSession'
import { Recorder } from './recorder'

// Records a real Camoufox signing in to a local stand-in for LinkedIn and checks what ended up in the recording:
// the files are there, the video plays, and none of the secrets are in any text. Needs the browser build
// (`camoufox fetch`) and Playwright's ffmpeg (`playwright-core install ffmpeg`).

const PASSWORD = 'hunter2-correct-horse'
const COOKIE_VALUE = 'cookie-value-abcdef123456'

let server: Server
let origin: string

beforeAll(async () => {
   server = createServer((request, response) => {
      const { pathname } = new URL(request.url ?? '/', 'http://localhost')
      const cookie = request.headers.cookie ?? ''
      const html = (body: string, headers: Record<string, string> = {}) => {
         response.writeHead(200, {
            'content-type': 'text/html',
            ...headers,
         })
         response.end(`<!doctype html><html><body>${body}<script>console.log('page says hello')</script></body></html>`)
      }

      if (pathname.startsWith('/feed')) {
         return cookie.includes('signed=') ? html('<h1>feed</h1>') : redirect(response, '/login')
      }

      if (pathname === '/login' && request.method === 'GET') {
         return html(
            '<form method="post" action="/login"><input id="username" name="u"><input id="password" name="p" type="password"><button type="submit">Sign in</button></form>'
         )
      }

      if (pathname === '/login' && request.method === 'POST') {
         let text = ''

         request.on('data', chunk => (text += String(chunk)))
         request.on('end', () => {
            if (new URLSearchParams(text).get('p') !== PASSWORD) {
               return redirect(response, '/checkpoint/lg/login-submit')
            }

            return redirect(response, '/feed/', { 'set-cookie': `signed=${COOKIE_VALUE}; Path=/` })
         })

         return undefined
      }

      if (pathname === '/checkpoint/lg/login-submit') {
         return html('<p id="error-for-password">Wrong password</p>')
      }

      response.writeHead(404)
      response.end('nothing here')

      return undefined
   })

   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

const redirect = (response: ServerResponse, to: string, headers: Record<string, string> = {}) => {
   response.writeHead(302, {
      location: to,
      ...headers,
   })
   response.end()
}

const record = async (baseUrl: string, password: string) => {
   const objects = new Map<string, Buffer>()
   const store = {
      put: async (key: string, body: string) => {
         objects.set(key, Buffer.from(body))
      },
      upload: async (key: string, path: string) => {
         objects.set(key, await readFile(path))
      },
   }
   const policy = HostPolicy.fromList('127.0.0.1')
   const driver = new CamoufoxDriver({
      actionTimeoutMs: 10_000,
      isAllowedNavigation: url => policy.allowsUrl(url),
   })
   const validator = new AccountValidator({
      baseUrl,
      mode: 'full',
      pause: host => new HostRateLimiter(0).wait(host),
      allowsCookieDomain: domain => policy.allowsCookieDomain(domain),
   })
   const recorder = await Recorder.start({
      kind: 'validate',
      id: 'e2e-run',
      mode: 'always',
      video: true,
      store,
   })

   recorder.addSecret(password)

   const session = await driver.open({ recorder })
   const verdict = await validator.validate(new RecordedSession(session, recorder), {
      email: 'ada@work.com',
      credentials: { password },
   })

   await session.close()

   const prefix = await recorder.finish({
      failed: verdict.outcome === 'ERROR',
      verdict: verdict.outcome,
   })

   return {
      verdict,
      prefix: prefix as string,
      objects,
      text: (name: string) => String(objects.get(`${prefix}/${name}`)),
   }
}

describe('A recorded run in a real browser', () => {
   it('should record the steps, the requests, the console and a video that plays, with no secret in the text', async () => {
      const run = await record(origin, PASSWORD)

      expect(run.verdict.outcome).toBe('VALID')

      const timeline = JSON.parse(run.text('timeline.json'))
      const network = JSON.parse(run.text('network.json'))
      const logs = JSON.parse(run.text('logs.json'))

      expect(timeline.outcome).toBe('ok')
      expect(timeline.steps.map((step: { call: string }) => step.call)).toEqual(
         expect.arrayContaining(['goto', 'fill', 'click'])
      )
      expect(timeline.steps.filter((step: { call: string }) => step.call === 'fill')).toEqual([
         expect.objectContaining({ length: 'ada@work.com'.length }),
         expect.objectContaining({ length: PASSWORD.length }),
      ])
      expect(network.some((entry: { method: string; status: number }) => entry.method === 'POST')).toBe(true)
      expect(logs).toEqual(
         expect.arrayContaining([
            expect.objectContaining({
               source: 'browser',
               message: 'page says hello',
            }),
         ])
      )

      const video = run.objects.get(`${run.prefix}/video.webm`)

      expect(video?.subarray(0, 4).toString('hex')).toBe('1a45dfa3')
      expect(video?.length).toBeGreaterThan(1000)
      expect([...run.objects.keys()].filter(key => key.includes('/screenshots/')).length).toBeGreaterThan(2)

      const text = [...run.objects.entries()]
         .filter(([key]) => !key.endsWith('.png') && !key.endsWith('.webm'))
         .map(([, body]) => body.toString())
         .join('\n')

      expect(text).not.toContain(PASSWORD)
      expect(text).not.toContain(COOKIE_VALUE)
   })

   it('should keep the failing step, its screenshot and the page when the sign-in page is missing', async () => {
      const run = await record(`${origin}/nowhere`, PASSWORD)

      expect(run.verdict.outcome).toBe('ERROR')

      const timeline = JSON.parse(run.text('timeline.json'))
      const failed = timeline.steps.find((step: { ok: boolean }) => !step.ok)

      expect(timeline.outcome).toBe('failed')
      expect(failed).toMatchObject({
         call: 'goto',
         error: expect.stringContaining('404'),
         screenshot: expect.stringContaining('-failed.png'),
      })
      expect(run.text('failure.html')).toContain('nothing here')
      expect(run.objects.has(`${run.prefix}/screenshots/${failed.screenshot}`)).toBe(true)
   })
})
