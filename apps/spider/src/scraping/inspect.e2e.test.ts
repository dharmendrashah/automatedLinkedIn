import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CamoufoxDriver } from './camoufoxDriver'

// Runs a real Camoufox against a local page. Needs the browser build: `pnpm exec camoufox fetch`.

const PAGE = `<!doctype html><html><head><title>Inspect me</title></head><body style="margin:0">
<div data-view-name="feed-item" data-urn="urn:li:activity:7001" style="height:200px">
  <a id="post" href="/feed/update/urn:li:activity:7001/" style="display:block;height:40px">2d  ago</a>
  <a id="author" href="/in/ada-lovelace/?miniProfile=1" aria-label="Ada Lovelace" style="display:block;height:40px">Ada</a>
  <button id="like" style="height:30px">Like</button>
  <div role="button" id="menu" style="height:30px">Menu</div>
</div>
<a id="tray" href="/messaging/" style="position:fixed;left:0;bottom:0;width:200px;height:60px">Messaging</a>
<div style="position:fixed;left:0;bottom:0;width:200px;height:60px;background:#ccc"></div>
<a id="hidden" href="/hidden/" style="display:none">hidden</a>
<div style="height:3000px"></div>
<a id="far" href="/far/">far away</a>
</body></html>`

let server: Server
let origin: string

// Two posts as a feed holds them: a wrapper that is `display: contents`, its identifiers in the markup, and an author link.
const BLOCKS = `<!doctype html><html><body style="margin:0">
<div data-view-name="post" style="display:contents">
  <p componentkey="commentary-Urn(userGeneratedContentId=7515779955943911424), locale=en">text</p>
  <a href="/in/grace-hopper/" data-view-name="actor" style="display:block;height:40px">Grace</a>
  <button data-view-name="reaction-button" style="height:30px">Like</button>
</div>
<div data-view-name="post" data-sdui-anchor-id="header-urn:li:activity:7517821287675764736-0">
  <a href="/company/acme/" data-view-name="actor" style="display:block;height:40px">Acme</a>
  <div id="replaceableComment_urn:li:comment:(activity:7517200604105043968,7517715078528266240)">a comment</div>
</div>
</body></html>`

beforeAll(async () => {
   server = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(request.url === '/blocks' ? BLOCKS : PAGE)
   })
   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

describe('CamoufoxSession.inspect', () => {
   it('should describe the links and controls as they show, with their place, cover and surroundings', async () => {
      const driver = new CamoufoxDriver({
         actionTimeoutMs: 10_000,
         isAllowedNavigation: () => true,
      })
      const session = await driver.open()

      try {
         await session.goto(`${origin}/`)

         const inspection = await session.inspect?.()

         expect(inspection).toBeDefined()

         if (!inspection) {
            return
         }

         expect(inspection).toMatchObject({
            url: `${origin}/`,
            title: 'Inspect me',
            scrollY: 0,
         })

         const link = (href: string) => inspection.links.find(found => found.href === `${origin}${href}`)

         expect(link('/feed/update/urn:li:activity:7001/')).toMatchObject({
            tag: 'a',
            text: '2d ago',
            inView: true,
            covered: false,
         })
         expect(link('/feed/update/urn:li:activity:7001/')?.path[0]).toBe(
            'div[data-view-name=feed-item][data-urn=urn:li:activity:7001]'
         )
         expect(link('/in/ada-lovelace/?miniProfile=1')).toMatchObject({ label: 'Ada Lovelace' })
         // A docked tray over the page: the link is there, but a click would land on whatever covers it.
         expect(link('/messaging/')).toMatchObject({
            inView: true,
            covered: true,
         })
         expect(link('/far/')).toMatchObject({ inView: false })
         expect(link('/hidden/')).toBeUndefined()

         expect(
            inspection.controls.map(({ tag, text, role }) => ({
               tag,
               text,
               role,
            }))
         ).toEqual([
            {
               tag: 'button',
               text: 'Like',
               role: '',
            },
            {
               tag: 'div',
               text: 'Menu',
               role: 'button',
            },
         ])
      } finally {
         await session.close()
      }
   })

   it('should say what each block carries and holds, although its wrapper has no box of its own', async () => {
      const driver = new CamoufoxDriver({
         actionTimeoutMs: 10_000,
         isAllowedNavigation: () => true,
      })
      const session = await driver.open()

      try {
         await session.goto(`${origin}/blocks`)

         const inspection = await session.inspect?.({ block: '[data-view-name="post"]' })

         expect(inspection?.blocks).toHaveLength(2)
         expect(inspection?.blocks[0]).toMatchObject({
            keys: ['commentary-Urn(userGeneratedContentId=7515779955943911424), locale=en'],
            marks: ['post', 'actor', 'reaction-button'],
         })
         expect(inspection?.blocks[0]?.links).toMatchObject([
            {
               href: `${origin}/in/grace-hopper/`,
               view: 'actor',
               inView: true,
               covered: false,
            },
         ])
         expect(inspection?.blocks[1]?.keys).toEqual([
            'header-urn:li:activity:7517821287675764736-0',
            'replaceableComment_urn:li:comment:(activity:7517200604105043968,7517715078528266240)',
         ])
         expect((await session.inspect?.())?.blocks).toEqual([])
      } finally {
         await session.close()
      }
   })
})
