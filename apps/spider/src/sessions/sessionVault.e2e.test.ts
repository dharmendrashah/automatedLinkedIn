import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MemoryStore } from '../devtools/memoryStore'
import { CamoufoxDriver } from '../scraping/camoufoxDriver'
import { SessionVault } from './sessionVault'

// Runs a real Camoufox: a page keeps a value in a cookie, local storage and IndexedDB, the vault saves the browser's state,
// and a new browser opened with it reads all three back. Needs the browser build: `pnpm exec camoufox fetch`.

const KEY = Buffer.alloc(32, 7).toString('base64')

// Opens the database, then runs `body` with its store and writes `done` when the work is finished.
const withStore = (mode: 'readwrite' | 'readonly', body: string) =>
   `<script>const open=indexedDB.open('app',1);open.onupgradeneeded=()=>open.result.createObjectStore('auth');open.onsuccess=()=>{const store=open.result.transaction('auth','${mode}').objectStore('auth');${body}}</script>`

const writePage = withStore(
   'readwrite',
   `document.cookie='sid=kept; path=/';localStorage.setItem('ls','kept');store.put('kept','token').onsuccess=()=>{document.body.insertAdjacentHTML('beforeend','<p id="done">written</p>')}`
)
const readPage = withStore(
   'readonly',
   `const got=store.get('token');got.onsuccess=()=>{document.body.insertAdjacentHTML('beforeend','<p id="done">idb='+got.result+' ls='+localStorage.getItem('ls')+' cookie='+document.cookie+'</p>')}`
)

let server: Server
let origin: string

beforeAll(async () => {
   server = createServer((request, response) => {
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

describe('SessionVault with a real browser', () => {
   it('should bring back the cookies, local storage and IndexedDB a site kept in an earlier browser', async () => {
      const vault = new SessionVault(new MemoryStore(), KEY)
      const first = await driver.open()

      try {
         await first.goto(`${origin}/write`, '#done')
         await vault.save('acc1', await first.storageState())
      } finally {
         await first.close()
      }

      const saved = await vault.load('acc1')
      const second = await driver.open({ ...(saved && { storageState: saved }) })

      try {
         await second.goto(`${origin}/read`, '#done')

         expect(await second.pageText()).toContain('idb=kept ls=kept cookie=sid=kept')
      } finally {
         await second.close()
      }
   })
})
