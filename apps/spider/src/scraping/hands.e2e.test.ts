import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CamoufoxDriver } from './camoufoxDriver'
import { type DetectionSession } from './driver'

// Runs a real Camoufox against local pages. Needs the browser build: `pnpm exec camoufox fetch`.

const PAGES: Record<string, string> = {
   '/hands': `<!doctype html><html><body style="margin:0">
<a id="author" href="/profile/ada" style="position:absolute;left:100px;top:150px;width:400px;height:60px;display:block;background:#eef">Ada
  <button id="follow" onclick="sessionStorage.setItem('followed','yes')" style="position:absolute;right:0;top:10px;width:220px;height:40px">Follow</button>
</a>
<a id="covered" href="/covered" style="position:absolute;left:100px;top:300px;width:300px;height:50px;display:block">covered</a>
<div style="position:absolute;left:0;top:290px;width:600px;height:70px;background:#ccc"></div>
<a id="spa" href="/spa" style="position:absolute;left:100px;top:420px;display:block"
   onclick="event.preventDefault();history.pushState({},'','/spa');document.getElementById('where').textContent='spa'">spa link</a>
<p id="where" style="position:absolute;left:100px;top:470px">hands</p>
<a id="image" href="/feed/" style="position:absolute;left:700px;top:150px;width:300px;height:200px;display:block;background:#cfc"
   onclick="event.preventDefault();document.title='window'">image
  <button id="inside" style="position:absolute;left:0;top:0;width:140px;height:200px" onclick="event.stopPropagation();document.title='button'">Open</button>
</a>
<button id="more" onclick="document.title='expanded'" style="position:absolute;left:100px;top:520px">… more</button>
<div style="height:3000px"></div>
</body></html>`,
   '/profile/ada': `<!doctype html><html><body><p id="followed"></p><script>document.getElementById('followed').textContent = 'followed:' + (sessionStorage.getItem('followed') || 'no')</script></body></html>`,
   '/covered': '<!doctype html><html><body>covered page</body></html>',
}

let server: Server
let origin: string

beforeAll(async () => {
   server = createServer((request, response) => {
      const html = PAGES[request.url ?? ''] ?? PAGES['/hands']

      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(html)
   })
   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

const withSession = async (work: (session: DetectionSession) => Promise<void>) => {
   const driver = new CamoufoxDriver({
      actionTimeoutMs: 10_000,
      isAllowedNavigation: () => true,
   })
   const session = await driver.open()

   try {
      await session.goto(`${origin}/hands`)
      await work(session)
   } finally {
      await session.close()
   }
}

describe('what a hand does on the page', () => {
   it('should click a link where no button sits under the pointer, and go back', async () => {
      await withSession(async session => {
         const landed = await session.clickLink?.(`${origin}/profile/ada`, 'button')

         expect(landed).toBe(`${origin}/profile/ada`)
         // The Follow button inside the link was never hit.
         expect(await session.pageText()).toBe('followed:no')
         expect(await session.back?.()).toBe(`${origin}/hands`)
      })
   })

   it('should not click a link that something covers', async () => {
      await withSession(async session => {
         expect(await session.clickLink?.(`${origin}/covered`, 'button')).toBeUndefined()
         expect(await session.pageText()).toContain('hands')
      })
   })

   it('should follow a link a script answers by changing the address, and go back through the history', async () => {
      await withSession(async session => {
         expect(await session.clickLink?.(`${origin}/spa`, 'button')).toBe(`${origin}/spa`)
         expect(await session.back?.()).toBe(`${origin}/hands`)
      })
   })

   it('should click a listed link that answers in script, where no button sits under the pointer', async () => {
      await withSession(async session => {
         const box = {
            x: 700,
            y: 150,
            width: 300,
            height: 200,
         }

         expect(await session.clickInside?.(box, 'button')).toBe(true)
         // The page stayed where it was: the link only opened a window, and the button inside it was not pressed.
         expect((await session.inspect?.())?.title).toBe('window')
         expect(
            await session.clickInside?.(
               {
                  x: 5,
                  y: 5,
                  width: 20,
                  height: 20,
               },
               'button'
            )
         ).toBe(false)
      })
   })

   it('should click a control that is in view and not covered', async () => {
      await withSession(async session => {
         expect(await session.clickSelector?.('#more')).toBe(true)
         expect((await session.inspect?.())?.title).toBe('expanded')
         expect(await session.clickSelector?.('#nothing')).toBe(false)
      })
   })

   it('should rest and drift the pointer without touching anything', async () => {
      await withSession(async session => {
         await session.hover?.(640, 400)
         await session.drift?.()

         expect(await session.pageText()).toContain('hands')
      })
   })
})
