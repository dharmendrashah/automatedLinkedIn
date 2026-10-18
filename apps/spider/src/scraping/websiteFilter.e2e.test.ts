import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { browserExecutablePath } from './browserPath'
import { CamoufoxDriver } from './camoufoxDriver'
import { installWebsiteFilter } from './websiteFilter'

// Runs a real Camoufox whose own website filter blocks the addresses that are not allowed, with no request intercepted, and
// shows its HTTP cache working across two starts of one profile. The filter goes into an instant copy of the browser (a
// copy-on-write clone), never into the installed one, which other tests and the local tool share.
// Needs the browser build (`pnpm exec camoufox fetch`).

const allowedHits: string[] = []
const otherHits: string[] = []
let allowed: Server
let other: Server
let allowedPort: number
let otherPort: number
let work: string
let clonedExecutable: string

const serve = (hits: string[], redirectTo?: () => string) =>
   createServer((request, response) => {
      hits.push(request.url ?? '')

      if (request.url === '/to-other' && redirectTo) {
         response.writeHead(302, { location: redirectTo() })
         response.end()
      } else if (request.url === '/asset.js') {
         response.writeHead(200, {
            'content-type': 'text/javascript',
            'cache-control': 'public, max-age=86400',
         })
         response.end('window.asset = "cached"')
      } else {
         response.writeHead(200, { 'content-type': 'text/html' })
         response.end('<!doctype html><body><p id="ready">page</p><script src="/asset.js"></script></body>')
      }
   })

const listen = (server: Server) =>
   new Promise<number>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
   })

// The browser's own folder: the .app bundle on macOS, the folder of the binary elsewhere.
const cloneBrowser = (executable: string, into: string) => {
   const bundle = executable.includes('.app/') ? `${executable.split('.app/')[0]}.app` : undefined
   const source = bundle ?? dirname(executable)
   const target = join(into, basename(source))

   execFileSync(
      'cp',
      process.platform === 'darwin' ? ['-cR', source, target] : ['-R', '--reflink=auto', source, target]
   )

   return bundle ? join(target, executable.slice(bundle.length + 1)) : join(target, basename(executable))
}

beforeAll(async () => {
   allowed = serve(allowedHits, () => `http://localhost:${otherPort}/landed`)
   other = serve(otherHits)
   allowedPort = await listen(allowed)
   otherPort = await listen(other)

   work = mkdtempSync(join(tmpdir(), 'website-filter-e2e-'))
   clonedExecutable = cloneBrowser(await browserExecutablePath(), work)
   // The allowed host is the address; `localhost` is another host, so it is refused.
   await installWebsiteFilter(clonedExecutable, ['127.0.0.1'], [])
}, 120_000)

afterAll(async () => {
   await new Promise(resolve => allowed.close(resolve))
   await new Promise(resolve => other.close(resolve))
   rmSync(work, {
      recursive: true,
      force: true,
   })
})

const driver = () =>
   new CamoufoxDriver({
      actionTimeoutMs: 10_000,
      isAllowedNavigation: () => true,
      blocking: 'browser',
      executablePath: clonedExecutable,
   })

describe('the browser website filter', () => {
   it('should refuse an address that is not allowed, also behind a redirect, before it reaches that server', async () => {
      const browser = await driver().open()

      try {
         await expect(browser.goto(`http://127.0.0.1:${allowedPort}/page`, '#ready')).resolves.toContain('/page')
         await expect(browser.goto(`http://localhost:${otherPort}/direct`)).rejects.toThrow()
         await expect(browser.goto(`http://127.0.0.1:${allowedPort}/to-other`)).rejects.toThrow()
      } finally {
         await browser.close()
      }

      expect(otherHits).toEqual([])
   })

   it('should serve a page asset from the HTTP cache after the profile is opened again', async () => {
      const profileDir = join(work, 'profile')
      const open = () => driver().open({ profileDir })
      const assetHits = () => allowedHits.filter(url => url === '/asset.js').length
      const first = await open()

      try {
         await first.goto(`http://127.0.0.1:${allowedPort}/cache`, '#ready')
      } finally {
         await first.close()
      }

      const before = assetHits()
      const second = await open()

      try {
         await second.goto(`http://127.0.0.1:${allowedPort}/cache`, '#ready')
      } finally {
         await second.close()
      }

      expect(assetHits() - before).toBe(0)
   })
})
