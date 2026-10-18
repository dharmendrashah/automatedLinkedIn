import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CamoufoxDriver } from '../../scraping/camoufoxDriver'
import { browseLinkedin } from './browse'

// Runs a real Camoufox through a stand-in for LinkedIn: a long feed with posts, the own profile behind /in/me/, post pages
// whose header links to the own profile before the author, and the authors' pages. It proves the links are read from what
// the browser really holds. Needs the browser build: `pnpm exec camoufox fetch`.

let server: Server
let origin: string
let signedIn = true
const opened: string[] = []

const page = (body: string) => `<!doctype html><html><body style="min-height:4000px">${body}</body></html>`
const header = '<header><a href="/in/ada-lovelace/">Me</a></header>'

beforeAll(async () => {
   server = createServer((request, response) => {
      const { pathname } = new URL(request.url ?? '/', 'http://localhost')
      const html = (body: string) => {
         response.writeHead(200, { 'content-type': 'text/html' })
         response.end(page(body))
      }

      opened.push(pathname)

      if (!signedIn && pathname !== '/login') {
         response.writeHead(302, { location: '/login' })
         response.end()

         return
      }

      if (pathname === '/feed/') {
         return html(
            `${header}<div><a href="/feed/update/urn:li:activity:7001/?utm=x">A</a></div><div><a href="/feed/update/urn:li:activity:7002/">B</a></div>`
         )
      }

      if (pathname === '/in/me/') {
         response.writeHead(302, { location: '/in/ada-lovelace/' })
         response.end()

         return
      }

      const post = /^\/feed\/update\/urn:li:activity:(\d+)\/$/.exec(pathname)

      if (post) {
         return html(`${header}<article><a href="/in/author-${post[1]}/">Author</a><p>Post</p></article>`)
      }

      return html(`<h1>${pathname}</h1>`)
   })

   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

const run = async (random: () => number) => {
   const driver = new CamoufoxDriver({
      actionTimeoutMs: 10_000,
      isAllowedNavigation: () => true,
   })
   const browser = await driver.open()
   const warnings: string[] = []

   try {
      const outcome = await browseLinkedin(
         {
            browser,
            visit: url => browser.goto(url),
            pause: async () => undefined,
            log: () => undefined,
            warn: message => warnings.push(message),
         },
         origin,
         random
      )

      return {
         outcome,
         warnings,
      }
   } finally {
      await browser.close()
   }
}

describe('browseLinkedin in a real browser, against a stand-in for LinkedIn', () => {
   it('should read the feed, the own profile, both posts and both authors', async () => {
      signedIn = true
      opened.length = 0

      await expect(run(() => 0.999999)).resolves.toEqual({
         outcome: 'DONE',
         warnings: [],
      })
      expect(opened).toEqual([
         '/feed/',
         '/in/me/',
         '/in/ada-lovelace/',
         '/feed/update/urn:li:activity:7002/',
         '/in/author-7002/',
         '/feed/update/urn:li:activity:7001/',
         '/in/author-7001/',
         '/feed/',
      ])
   })

   it('should stop at once when the feed asks for a sign-in', async () => {
      signedIn = false

      await expect(run(() => 0)).resolves.toMatchObject({ outcome: 'SIGNED_OUT' })
   })
})
