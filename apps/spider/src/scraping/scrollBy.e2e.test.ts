import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CamoufoxDriver } from './camoufoxDriver'

// Runs a real Camoufox against local pages. Needs the browser build: `pnpm exec camoufox fetch`.

const page = (head: string, body: string) =>
   `<!doctype html><html><head>${head}</head><body style="margin:0">${body}<div style="height:5000px"></div></body></html>`

const PAGES: Record<string, string> = {
   // A fixed header over the top-left corner, where the pointer starts, that takes the wheel for itself.
   '/header': page(
      '<script>addEventListener("DOMContentLoaded", () => document.getElementById("nav").addEventListener("wheel", e => e.preventDefault(), { passive: false }))</script>',
      '<div id="nav" style="position:fixed;top:0;left:0;right:0;height:100px;background:#ccc"></div>'
   ),
   // A page that cancels every wheel turn, so only a scroll made by the page itself moves it.
   '/swallow': page('<script>addEventListener("wheel", e => e.preventDefault(), { passive: false })</script>', ''),
}

let server: Server
let origin: string

beforeAll(async () => {
   server = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(PAGES[request.url ?? ''] ?? page('', ''))
   })
   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

const scrolledAfter = async (path: string, pixels: number) => {
   const driver = new CamoufoxDriver({
      actionTimeoutMs: 10_000,
      isAllowedNavigation: () => true,
   })
   const session = await driver.open()

   try {
      await session.goto(`${origin}${path}`)
      await session.scrollBy(pixels)

      return (await session.inspect?.())?.scrollY
   } finally {
      await session.close()
   }
}

describe('CamoufoxSession.scrollBy', () => {
   it('should move the page although a header at the corner takes the wheel', async () => {
      expect(await scrolledAfter('/header', 600)).toBeGreaterThan(100)
   })

   it('should move the page by script when the page cancels every wheel turn', async () => {
      expect(await scrolledAfter('/swallow', 600)).toBeGreaterThan(100)
   })
})
