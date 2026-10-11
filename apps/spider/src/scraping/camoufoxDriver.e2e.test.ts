import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type ScrapeTaskCommand } from '../types'

import { ObjectNotFoundError } from '../storage/store'
import { CamoufoxDriver } from './camoufoxDriver'
import { ScrapeEngine } from './engine'
import { TaskError } from './errors'
import { HostPolicy } from './policy'
import { HostRateLimiter } from './rateLimiter'
import { RobotsGuard } from './robots'

// Runs a real Camoufox against a local test site. Needs the browser build: `pnpm exec camoufox fetch`.

const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`

const posts = (names: string[]) =>
   names
      .map(name => `<div class="post"><b class="author">${name}</b><p class="text">Post by ${name}</p></div>`)
      .join('')

let server: Server
let origin: string

const handler: Parameters<typeof createServer>[1] = (request, response) => {
   const path = request.url ?? '/'
   const html = (body: string, status = 200) => {
      response.writeHead(status, { 'content-type': 'text/html' })
      response.end(page(body))
   }

   if (path === '/robots.txt') {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('User-agent: *\nDisallow: /private\n')
   } else if (path === '/feed') {
      html(`${posts(['Ada', 'Grace', 'Linus'])}<a class="next" href="/page2">next</a>`)
   } else if (path === '/page2') {
      html(posts(['Alan', 'Barbara']))
   } else if (path === '/private') {
      html(posts(['Hidden']))
   } else if (path === '/offsite') {
      response.writeHead(302, { location: 'http://127.0.0.2:9/elsewhere' })
      response.end()
   } else if (path === '/whoami') {
      html(
         `<div class="post"><b class="author">cookie</b><p class="text">${request.headers.cookie ?? 'none'}</p></div>`
      )
   } else if (path === '/login') {
      response.writeHead(200, {
         'content-type': 'text/html',
         'set-cookie': 'sid=fresh456; Path=/',
      })
      response.end(page(posts(['Login'])))
   } else {
      html('missing', 404)
   }
}

beforeAll(async () => {
   server = createServer(handler)
   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

const selectors = {
   wrapper: '.post',
   author: '.author',
   text: '.text',
}

const command = (path: string, actions: ScrapeTaskCommand['actions']): ScrapeTaskCommand => ({
   task_id: '0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11',
   task_type: 'e2e',
   timestamp: '2026-10-11T10:00:00.000Z',
   auth_session_key: 'sessions/e2e.json',
   target_url: `${origin}${path}`,
   actions,
})

const engine = (session = '[]', robotsExempt = '', objects: Record<string, string> = {}) => {
   const policy = HostPolicy.fromList('127.0.0.1', robotsExempt)

   return new ScrapeEngine({
      driver: new CamoufoxDriver({
         actionTimeoutMs: 10_000,
         isAllowedNavigation: url => {
            try {
               return policy.allowsHost(new URL(url).hostname)
            } catch {
               return false
            }
         },
      }),
      policy,
      robots: new RobotsGuard('automatedlinkedin-spider'),
      limiter: new HostRateLimiter(0),
      store: {
         get: async (key: string) => {
            if (key in objects) {
               return objects[key]
            }

            if (key === 'sessions/e2e.json') {
               return session
            }

            throw new ObjectNotFoundError(key)
         },
      },
      maxRecords: 100,
   })
}

describe('ScrapeEngine with a real browser', () => {
   it('should extract the records of a page', async () => {
      const { records } = await engine().run(
         command('/feed', [
            {
               step: 1,
               action: 'navigate',
               params: { wait_for_selector: '.post' },
            },
            {
               step: 2,
               action: 'extract',
               params: { selectors },
            },
         ])
      )

      expect(records).toEqual([
         {
            author: 'Ada',
            text: 'Post by Ada',
         },
         {
            author: 'Grace',
            text: 'Post by Grace',
         },
         {
            author: 'Linus',
            text: 'Post by Linus',
         },
      ])
   })

   it('should click through to the next page and extract again', async () => {
      const { records } = await engine().run(
         command('/feed', [
            {
               step: 1,
               action: 'navigate',
               params: {},
            },
            {
               step: 2,
               action: 'extract',
               params: { selectors },
            },
            {
               step: 3,
               action: 'interaction',
               params: {
                  click_element: 'a.next',
                  wait_for_selector: '.post',
               },
            },
            {
               step: 4,
               action: 'extract',
               params: { selectors },
            },
         ])
      )

      expect(records.map(record => record.author)).toEqual(['Ada', 'Grace', 'Linus', 'Alan', 'Barbara'])
   })

   it('should stop at the record limit', async () => {
      const limited = new ScrapeEngine({
         driver: new CamoufoxDriver({
            actionTimeoutMs: 10_000,
            isAllowedNavigation: () => true,
         }),
         policy: HostPolicy.fromList('127.0.0.1'),
         robots: new RobotsGuard('automatedlinkedin-spider'),
         limiter: new HostRateLimiter(0),
         store: { get: async () => '[]' },
         maxRecords: 2,
      })

      const { records } = await limited.run(
         command('/feed', [
            {
               step: 1,
               action: 'navigate',
               params: {},
            },
            {
               step: 2,
               action: 'extract',
               params: { selectors },
            },
         ])
      )

      expect(records).toHaveLength(2)
   })

   it('should refuse a page that robots.txt disallows', async () => {
      await expect(
         engine().run(
            command('/private', [
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
            ])
         )
      ).rejects.toThrow(/robots\.txt/)
   })

   it('should block a redirect to a host that is not allowed', async () => {
      await expect(
         engine().run(
            command('/offsite', [
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
            ])
         )
      ).rejects.toThrow(TaskError)
   })

   it('should report a 404 as a failed task instead of extracting an error page', async () => {
      await expect(
         engine().run(
            command('/missing', [
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
            ])
         )
      ).rejects.toThrow(/answered 404/)
   })

   it('should send a stored session cookie to an allowed host', async () => {
      const session = JSON.stringify([
         {
            name: 'sid',
            value: 'abc123',
            domain: '127.0.0.1',
            path: '/',
         },
      ])

      const { records } = await engine(session).run(
         command('/whoami', [
            {
               step: 1,
               action: 'login',
               params: { use_session_cookies: true },
            },
            {
               step: 2,
               action: 'navigate',
               params: {},
            },
            {
               step: 3,
               action: 'extract',
               params: { selectors },
            },
         ])
      )

      expect(records[0].text).toContain('sid=abc123')
   })

   it('should continue an account from its previous session and hand back the refreshed cookies', async () => {
      const previous = JSON.stringify({
         cookies: [
            {
               name: 'sid',
               value: 'old123',
               domain: '127.0.0.1',
               path: '/',
            },
         ],
      })

      const { records, cookies } = await engine('[]', '', { 'sessions/acc1/state.json': previous }).run({
         ...command('/whoami', [
            {
               step: 1,
               action: 'navigate',
               params: {},
            },
            {
               step: 2,
               action: 'extract',
               params: { selectors },
            },
            {
               step: 3,
               action: 'navigate',
               params: { url: `${origin}/login` },
            },
         ]),
         account_id: 'acc1',
      })

      expect(records[0].text).toContain('sid=old123')
      expect(cookies.find(({ name }) => name === 'sid')?.value).toBe('fresh456')
   })

   it('should skip robots.txt for an exempt host, and still refuse it otherwise', async () => {
      const actions: ScrapeTaskCommand['actions'] = [
         {
            step: 1,
            action: 'navigate',
            params: {},
         },
      ]

      await expect(engine('[]', '127.0.0.1').run(command('/private', actions))).resolves.toBeDefined()
      await expect(engine().run(command('/private', actions))).rejects.toThrow(/robots\.txt/)
   })

   it('should fail the task, not connect directly, when the proxy cannot be used', async () => {
      await expect(
         engine().run({
            ...command('/feed', [
               {
                  step: 1,
                  action: 'navigate',
                  params: {},
               },
            ]),
            proxy: { server: 'http://127.0.0.1:9' },
         })
      ).rejects.toThrow(TaskError)
   })

   it('should be Camoufox: a Firefox that is not announced as headless', async () => {
      const { Camoufox } = await import('camoufox')
      const browser = await Camoufox({ headless: true })
      const userAgent = await (await browser.newPage()).evaluate(() => navigator.userAgent)

      await browser.close()

      expect(userAgent).toContain('Firefox/')
      expect(userAgent).not.toContain('Headless')
   })
})
