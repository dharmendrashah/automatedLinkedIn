import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
   '/panes': `<!doctype html><html><body style="margin:0">
<div id="list" style="position:absolute;left:0;top:0;width:300px;height:300px;overflow:auto"><div class="row" onclick="document.title='row 0'" style="height:60px;border-bottom:1px solid #999">Row 0 <button onclick="event.stopPropagation();document.title='button 0'">Menu</button></div><div class="row" onclick="document.title='row 1'" style="height:60px;border-bottom:1px solid #999">Row 1 <button onclick="event.stopPropagation();document.title='button 1'">Menu</button></div><div class="row" onclick="document.title='row 2'" style="height:60px;border-bottom:1px solid #999">Row 2 <button onclick="event.stopPropagation();document.title='button 2'">Menu</button></div><div class="row" onclick="document.title='row 3'" style="height:60px;border-bottom:1px solid #999">Row 3 <button onclick="event.stopPropagation();document.title='button 3'">Menu</button></div><div class="row" onclick="document.title='row 4'" style="height:60px;border-bottom:1px solid #999">Row 4 <button onclick="event.stopPropagation();document.title='button 4'">Menu</button></div><div class="row" onclick="document.title='row 5'" style="height:60px;border-bottom:1px solid #999">Row 5 <button onclick="event.stopPropagation();document.title='button 5'">Menu</button></div><div class="row" onclick="document.title='row 6'" style="height:60px;border-bottom:1px solid #999">Row 6 <button onclick="event.stopPropagation();document.title='button 6'">Menu</button></div><div class="row" onclick="document.title='row 7'" style="height:60px;border-bottom:1px solid #999">Row 7 <button onclick="event.stopPropagation();document.title='button 7'">Menu</button></div><div class="row" onclick="document.title='row 8'" style="height:60px;border-bottom:1px solid #999">Row 8 <button onclick="event.stopPropagation();document.title='button 8'">Menu</button></div><div class="row" onclick="document.title='row 9'" style="height:60px;border-bottom:1px solid #999">Row 9 <button onclick="event.stopPropagation();document.title='button 9'">Menu</button></div><div class="row" onclick="document.title='row 10'" style="height:60px;border-bottom:1px solid #999">Row 10 <button onclick="event.stopPropagation();document.title='button 10'">Menu</button></div><div class="row" onclick="document.title='row 11'" style="height:60px;border-bottom:1px solid #999">Row 11 <button onclick="event.stopPropagation();document.title='button 11'">Menu</button></div><div class="row" onclick="document.title='row 12'" style="height:60px;border-bottom:1px solid #999">Row 12 <button onclick="event.stopPropagation();document.title='button 12'">Menu</button></div><div class="row" onclick="document.title='row 13'" style="height:60px;border-bottom:1px solid #999">Row 13 <button onclick="event.stopPropagation();document.title='button 13'">Menu</button></div><div class="row" onclick="document.title='row 14'" style="height:60px;border-bottom:1px solid #999">Row 14 <button onclick="event.stopPropagation();document.title='button 14'">Menu</button></div><div class="row" onclick="document.title='row 15'" style="height:60px;border-bottom:1px solid #999">Row 15 <button onclick="event.stopPropagation();document.title='button 15'">Menu</button></div><div class="row" onclick="document.title='row 16'" style="height:60px;border-bottom:1px solid #999">Row 16 <button onclick="event.stopPropagation();document.title='button 16'">Menu</button></div><div class="row" onclick="document.title='row 17'" style="height:60px;border-bottom:1px solid #999">Row 17 <button onclick="event.stopPropagation();document.title='button 17'">Menu</button></div><div class="row" onclick="document.title='row 18'" style="height:60px;border-bottom:1px solid #999">Row 18 <button onclick="event.stopPropagation();document.title='button 18'">Menu</button></div><div class="row" onclick="document.title='row 19'" style="height:60px;border-bottom:1px solid #999">Row 19 <button onclick="event.stopPropagation();document.title='button 19'">Menu</button></div></div>
<div id="thread" style="position:absolute;left:400px;top:0;width:300px;height:300px;overflow:auto"><div style="height:1500px">thread</div></div>
<script>document.getElementById('thread').scrollTop = 1200</script>
</body></html>`,
   '/composer': `<!doctype html><html><body style="margin:0">
<div id="box" contenteditable="true" role="textbox" style="position:absolute;left:100px;top:100px;width:400px;height:120px;border:1px solid #999"
  onkeydown="if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.title = 'sent' }"></div>
</body></html>`,
   '/upload': `<!doctype html><html><body>
<input id="hidden" class="picker" type="file" accept="image/*" multiple style="display:none"
  onchange="document.title = Array.from(this.files).map(file => file.name + ':' + file.size).join(',')">
</body></html>`,
   '/profile/ada': `<!doctype html><html><body><p id="followed"></p><script>document.getElementById('followed').textContent = 'followed:' + (sessionStorage.getItem('followed') || 'no')</script></body></html>`,
   '/covered': '<!doctype html><html><body>covered page</body></html>',
   '/answers': `<!doctype html><html><body>
<button id="ok" onclick="fetch('/api/messages?action=createMessage&status=200', { method: 'POST' })">ok</button>
<button id="refused" onclick="fetch('/api/messages?action=createMessage&status=422', { method: 'POST' })">refused</button>
<button id="other" onclick="fetch('/api/presence?status=200', { method: 'POST' }); fetch('/api/messages?action=createMessage&status=201')">other</button>
</body></html>`,
}

let server: Server
let origin: string

beforeAll(async () => {
   server = createServer((request, response) => {
      if (request.url === '/files/pic.png') {
         response.writeHead(200, { 'content-type': 'image/png; charset=binary' })
         response.end(Buffer.from('12345'))

         return
      }

      if (request.url === '/files/moved') {
         response.writeHead(302, { location: '/files/pic.png' })
         response.end()

         return
      }

      if (request.url === '/files/missing') {
         response.writeHead(404)
         response.end()

         return
      }

      if (request.url?.startsWith('/api/')) {
         response.writeHead(Number(new URL(request.url, 'http://x').searchParams.get('status') ?? 200))
         response.end('{}')

         return
      }

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

   it('should click the Nth element of a selector in view, never the menu button inside it', async () => {
      await withSession(async session => {
         await session.goto(`${origin}/panes`)

         expect(await session.clickNth?.('.row', 1, 'button')).toBe(true)
         expect((await session.inspect?.())?.title).toBe('row 1')
         // A row below the fold of its list cannot be clicked until the list is scrolled to it.
         expect(await session.clickNth?.('.row', 12, 'button')).toBe(false)
         expect(await session.clickNth?.('.row', 99, 'button')).toBe(false)
      })
   })

   it('should scroll the pane under the pointer and say whether it moved', async () => {
      await withSession(async session => {
         await session.goto(`${origin}/panes`)

         // A wheel moves a pane by less than it is asked (about half in Firefox), so how far is not relied on, only that it moved.
         expect(await session.scrollOver?.('.row', 400)).toBe(true)
         expect(await session.clickNth?.('.row', 5, 'button')).toBe(true)
         expect((await session.inspect?.())?.title).toBe('row 5')

         // The other pane scrolls on its own, up to its top, where it moves no more.
         let moved: boolean | undefined = true

         for (let wheels = 0; moved && wheels < 8; wheels += 1) {
            moved = await session.scrollOver?.('#thread', -2000)
         }

         expect(moved).toBe(false)
         expect(await session.scrollOver?.('#nothing', -400)).toBe(false)
      })
   })

   it('should type into the box that was clicked, a line break as a new line and never as a send', async () => {
      await withSession(async session => {
         await session.goto(`${origin}/composer`)

         expect(await session.clickSelector?.('#box')).toBe(true)

         await session.typeKeys?.('one two\nthree')

         const html = await session.pageHtml()

         expect(html).toContain('one two')
         expect(html).toContain('three')
         expect((await session.inspect?.())?.title).not.toBe('sent')
      })
   })

   it('should give files to a hidden file input, and say there is none when the selector matches nothing', async () => {
      const folder = await mkdtemp(join(tmpdir(), 'attach-'))
      const first = join(folder, 'one.png')
      const second = join(folder, 'two.pdf')

      await writeFile(first, Buffer.from('12345'))
      await writeFile(second, Buffer.from('1234567890'))

      try {
         await withSession(async session => {
            await session.goto(`${origin}/upload`)

            expect(await session.attachFiles?.('input.picker', [first, second])).toBe(true)
            expect((await session.inspect?.())?.title).toBe('one.png:5,two.pdf:10')
            expect(await session.attachFiles?.('input.nothing', [first])).toBe(false)
         })
      } finally {
         await rm(folder, {
            recursive: true,
            force: true,
         })
      }
   })

   it('should download a file the page points to, and give up on a missing one, a redirect or one that is too large', async () => {
      await withSession(async session => {
         await expect(session.fetchFile?.(`${origin}/files/pic.png`, 100)).resolves.toEqual({
            body: Buffer.from('12345'),
            contentType: 'image/png',
         })
         await expect(session.fetchFile?.(`${origin}/files/pic.png`, 4)).resolves.toBeUndefined()
         await expect(session.fetchFile?.(`${origin}/files/missing`, 100)).resolves.toBeUndefined()
         await expect(session.fetchFile?.(`${origin}/files/moved`, 100)).resolves.toBeUndefined()
      })
   })

   it('should hear only the answers to the requests asked about, from the moment it was started, and stop when told', async () => {
      await withSession(async session => {
         await session.goto(`${origin}/answers`)

         const watch = session.watchAnswers?.('POST', ['/api/messages', 'action=createMessage'])
         const waitFor = async (count: number) => {
            for (let looks = 0; looks < 50 && (watch?.statuses().length ?? 0) < count; looks += 1) {
               await new Promise(resolve => setTimeout(resolve, 100))
            }
         }

         await session.clickSelector?.('#ok')
         await waitFor(1)
         await session.clickSelector?.('#refused')
         await waitFor(2)
         // Another kind of request, and another address, are not what was asked about.
         await session.clickSelector?.('#other')
         await new Promise(resolve => setTimeout(resolve, 500))

         expect(watch?.statuses()).toEqual([200, 422])

         watch?.stop()
         await session.clickSelector?.('#ok')
         await new Promise(resolve => setTimeout(resolve, 500))

         expect(watch?.statuses()).toEqual([200, 422])
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
