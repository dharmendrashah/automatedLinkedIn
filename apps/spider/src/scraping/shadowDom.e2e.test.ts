import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CamoufoxDriver } from './camoufoxDriver'

// Runs a real Camoufox against a local page. LinkedIn's composer sits in an open shadow root (recorded 2026-10-26), which
// `page.content()` and `document.querySelectorAll` do not reach. Needs the browser build: `pnpm exec camoufox fetch`.

const PAGE = `<!doctype html><html><body style="margin:0">
<div id="host" style="position:absolute;top:20px;left:20px;width:300px;height:120px"></div>
<script>
const outer = document.getElementById('host').attachShadow({ mode: 'open' })
outer.innerHTML = '<div id="inner-host" style="width:300px;height:120px"></div>'
const inner = outer.getElementById('inner-host').attachShadow({ mode: 'open' })
inner.innerHTML = '<button id="go" style="width:200px;height:60px">Go</button><div contenteditable="true" id="box">x</div>'
inner.getElementById('go').addEventListener('click', () => { document.title = 'clicked' })
</script></body></html>`

let server: Server
let origin: string

beforeAll(async () => {
   server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(PAGE)
   })
   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

describe('a page whose controls are in shadow roots', () => {
   it('should show them in the page html and click them', { timeout: 120_000 }, async () => {
      const driver = new CamoufoxDriver({
         actionTimeoutMs: 15_000,
         isAllowedNavigation: () => true,
         blocking: 'none',
      })
      const session = await driver.open()

      try {
         await session.goto(`${origin}/`)

         expect(await session.pageHtml()).toContain('id="go"')
         expect(await session.clickSelector?.('button#go')).toBe(true)
         expect(await session.clickSelector?.('button#missing')).toBe(false)
         await expect.poll(async () => (await session.pageHtml()).includes('<title>clicked</title>')).toBe(true)
      } finally {
         await session.close()
      }
   })
})
