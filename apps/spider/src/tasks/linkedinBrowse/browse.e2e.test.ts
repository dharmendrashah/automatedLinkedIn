import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CamoufoxDriver } from '../../scraping/camoufoxDriver'
import { browseLinkedin } from './browse'

// Runs a real Camoufox through a stand-in for today's LinkedIn: a feed of posts marked up the way the real one is (a block per
// post with its id in a component key, an action bar, an author link with a Follow button next to it), a block of
// recommendations whose rows are links with a Follow button inside, post pages by address, and profiles. It proves the walk
// clicks and goes back for real and never presses Follow. Needs the browser build: `pnpm exec camoufox fetch`.

// More posts than a walk can use, as a feed that goes on.
const POSTS = Array.from({ length: 24 }, (_, index) => index + 1)
const idOf = (n: number) => `7000000000000000${String(n).padStart(3, '0')}`

let server: Server
let origin: string
const opened: string[] = []
const followed: string[] = []
const windows: string[] = []

const page = (body: string) => `<!doctype html><html><body style="margin:0;font:14px sans-serif">${body}</body></html>`
const rail =
   '<a data-view-name="identity-self-profile" href="/in/ada-lovelace/" style="position:fixed;right:0;top:0">Me</a>'

// Every odd post has a big image and no id in its markup, as the posts of images do: a click on the image opens the post in a
// window over the feed with no address change, and Escape closes it. A send link and a likers link sit by it, never to be clicked.
const imageOf = (n: number) => `
  <a href="/feed/" onclick="event.preventDefault();fetch('/window?n=${n}');openWindow()" style="display:block;width:480px;height:200px;background:#cfc">Image ${n}</a>
  <a aria-label="Send" href="/feed/" onclick="fetch('/followed?send=${n}')" style="display:block;width:40px;height:40px">Send</a>
  <a data-view-name="view-likers" href="/feed/" onclick="fetch('/followed?likers=${n}')" style="display:block;width:200px;height:20px">3 reactions</a>
  <div role="dialog" aria-hidden="true" style="display:none"></div>`

const postBlock = (
   n: number
) => `<div role="listitem" style="height:${n % 2 ? 520 : 320}px;position:relative"><div data-view-name="feed-full-update" style="display:contents">
  <p data-view-name="feed-commentary" ${n % 2 ? '' : `componentkey="commentary-(userGeneratedContentId=${idOf(n)}), en"`}>Post ${n}</p>${n % 2 ? imageOf(n) : ''}
  <a data-view-name="feed-actor" href="/in/author-${n}/" style="display:block;width:420px;height:60px;position:relative;background:#eef">Author ${n}
    <button data-view-name="relationship-building-button" onclick="fetch('/followed?n=${n}')" style="position:absolute;right:0;top:10px;width:150px;height:40px">Follow</button>
  </a>
  <button data-view-name="reaction-button" onclick="fetch('/followed?like=${n}')">Like</button>
</div></div>`

const script = `<script>
function openWindow(){
  const dialog=document.createElement('div')
  dialog.setAttribute('role','dialog')
  dialog.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100vh;background:#222;z-index:9'
  document.body.append(dialog)
}
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelector('[role=dialog]:not([aria-hidden])')?.remove()})
</script>`

const recommendations = `<div role="listitem" style="height:200px;position:relative"><div data-view-name="feed-full-update" style="display:contents">
  <a data-view-name="feed-actor" href="/in/recommended/" style="display:block;width:420px;height:60px;position:relative;background:#fee">Recommended
    <button data-view-name="edge-creation-follow-action" onclick="fetch('/followed?rec=1')" style="position:absolute;right:0;top:10px;width:150px;height:40px">Follow</button>
  </a>
</div></div>`

beforeAll(async () => {
   server = createServer((request, response) => {
      const { pathname, searchParams } = new URL(request.url ?? '/', 'http://localhost')
      const html = (body: string) => {
         response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
         response.end(page(body))
      }

      if (pathname === '/followed') {
         followed.push(request.url ?? '')
         response.writeHead(204)
         response.end()

         return
      }

      if (pathname === '/window') {
         windows.push(searchParams.get('n') ?? '')
         response.writeHead(204)
         response.end()

         return
      }

      opened.push(pathname)

      if (pathname === '/feed/') {
         return html(
            `${rail}${recommendations}${POSTS.map(postBlock).join('')}<div style="height:1500px"></div>${script}`
         )
      }

      const found = /^\/feed\/update\/urn:li:ugcPost:7000000000000000(\d{3})\/$/.exec(pathname)

      if (found) {
         const n = Number(found[1])

         return html(
            `${rail}<div data-view-name="feed-full-update" style="display:contents">
<a data-view-name="feed-actor" href="/in/author-${n}/" style="display:block;height:60px">Author ${n}</a>
<span data-testid="expandable-text-box"><button onclick="this.remove()">… more</button></span>
<div style="height:1800px"></div></div>`
         )
      }

      return html(`<h1>${pathname}</h1><div style="height:1500px"></div>`)
   })

   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

// A seeded source of numbers, so a run can be repeated.
const seeded = (seed: number) => {
   let state = seed

   return () => {
      state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

      return state / 4_294_967_296
   }
}

// The pauses are not waited for but counted, four times as long as they are, so a walk of minutes takes a minute or so.
const run = async (seed: number) => {
   const driver = new CamoufoxDriver({
      actionTimeoutMs: 10_000,
      isAllowedNavigation: () => true,
   })
   const browser = await driver.open()
   const warnings: string[] = []
   let time = 0

   try {
      const outcome = await browseLinkedin(
         {
            browser,
            visit: url => browser.goto(url),
            pause: async ms => {
               time += ms * 4
            },
            log: () => undefined,
            warn: message => warnings.push(message),
            attach: () => undefined,
            screenshot: async () => undefined,
         },
         origin,
         seeded(seed),
         false,
         () => time
      )

      return {
         outcome,
         warnings,
      }
   } finally {
      await browser.close()
   }
}

describe("browseLinkedin in a real browser, against a stand-in for today's LinkedIn", () => {
   it.each([7, 21, 99])(
      'should leave the feed by real clicks and addresses, come back, and never press a Follow button (day %i)',
      async day => {
         const { outcome, warnings } = await run(day)

         expect(outcome).toBe('DONE')
         expect(warnings).toEqual([])
         // It went somewhere: a profile of an author, or a post page.
         expect(opened.some(path => /^\/in\/author-\d+\/$/.test(path) || path.startsWith('/feed/update/'))).toBe(true)
         // The recommended row was never opened, and no Follow, Like or other button was ever pressed.
         expect(opened).not.toContain('/in/recommended/')
         // Nothing was pressed that must never be: no Follow, Like, Send or likers link.
         expect(followed).toEqual([])
         // Posts with an image were read in their window.
         expect(windows.length).toBeGreaterThan(0)
      }
   )
})
