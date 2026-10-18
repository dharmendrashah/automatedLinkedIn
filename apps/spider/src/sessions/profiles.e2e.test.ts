import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { Readable, Writable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CamoufoxDriver } from '../scraping/camoufoxDriver'
import { BucketProfiles } from './profiles'

// Runs a real Camoufox in a profile folder: a page keeps a cookie, local storage and IndexedDB; the profile is packed,
// sealed, unpacked into a new folder, and a new browser finds all of it. The HTTP cache is packed too, but Playwright does
// not read it while the allowlist route is on ("enabling routing disables http cache"), so it is not checked here.
// Needs the browser build (`pnpm exec camoufox fetch`) and `tar`.

const KEY = Buffer.alloc(32, 7).toString('base64')

const objects = new Map<string, Buffer>()
const store = {
   readStream: (key: string) => {
      const body = objects.get(key)

      return body
         ? Readable.from([body])
         : new Readable({
              read() {
                 this.destroy(Object.assign(new Error('No such object'), { code: 404 }))
              },
           })
   },
   writeStream: (key: string) => {
      const parts: Buffer[] = []

      return new Writable({
         write(chunk: Buffer, _encoding, done) {
            parts.push(chunk)
            done()
         },
         final(done) {
            objects.set(key, Buffer.concat(parts))
            done()
         },
      })
   },
}

const withStore = (mode: 'readwrite' | 'readonly', body: string) =>
   `<script>const open=indexedDB.open('app',1);open.onupgradeneeded=()=>open.result.createObjectStore('auth');open.onsuccess=()=>{const store=open.result.transaction('auth','${mode}').objectStore('auth');${body}}</script>`

const writePage = `<script src="/asset.js"></script>${withStore(
   'readwrite',
   `document.cookie='sid=kept; path=/; max-age=86400';localStorage.setItem('ls','kept');store.put('kept','token').onsuccess=()=>{document.body.insertAdjacentHTML('beforeend','<p id="done">written</p>')}`
)}`
const readPage = `<script src="/asset.js"></script>${withStore(
   'readonly',
   `const got=store.get('token');got.onsuccess=()=>{document.body.insertAdjacentHTML('beforeend','<p id="done">idb='+got.result+' ls='+localStorage.getItem('ls')+' cookie='+document.cookie+' asset='+window.asset+'</p>')}`
)}`

let server: Server
let origin: string

beforeAll(async () => {
   server = createServer((request, response) => {
      if (request.url === '/asset.js') {
         response.writeHead(200, {
            'content-type': 'text/javascript',
            'cache-control': 'public, max-age=86400',
         })
         response.end('window.asset = "cached"')

         return
      }

      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`<!doctype html><html><body>${request.url === '/write' ? writePage : readPage}</body></html>`)
   })
   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

const driver = new CamoufoxDriver({
   actionTimeoutMs: 10_000,
   isAllowedNavigation: () => true,
})

describe('BucketProfiles with a real browser', () => {
   it('should bring back the whole profile, cache included, in a new folder for the next run', async () => {
      const profiles = new BucketProfiles(store, KEY)
      const first = await profiles.checkout('acc1')

      expect(first.restored).toBe(false)

      const browser = await driver.open({ profileDir: first.dir })

      try {
         await browser.goto(`${origin}/write`, '#done')
      } finally {
         await browser.close()
      }

      await first.keep()
      await first.release()

      const second = await profiles.checkout('acc1')

      expect(second.restored).toBe(true)
      expect(second.dir).not.toBe(first.dir)

      const again = await driver.open({ profileDir: second.dir })

      try {
         await again.goto(`${origin}/read`, '#done')

         expect(await again.pageText()).toContain('idb=kept ls=kept cookie=sid=kept asset=cached')
      } finally {
         await again.close()
         await second.release()
      }
   })
})
