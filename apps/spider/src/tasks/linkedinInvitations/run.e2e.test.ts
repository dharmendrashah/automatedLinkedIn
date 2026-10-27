import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { invitationsFileSchema } from '@automatedLinkedIn/contracts'

import { invitationRow } from '../../linkedin/invitationFixture'
import { CamoufoxDriver } from '../../scraping/camoufoxDriver'
import { runInvitations } from './run'

// Runs a real Camoufox through a stand-in for LinkedIn's connection requests, made like the preview recorded on 2026-10-27 (rows
// named by the request's number with an Accept and an Ignore button), in a list that scrolls inside its own pane and draws more rows
// as it is scrolled to its end, and whose buttons take a request off the page a moment after they are pressed. It proves the reading
// scrolls the right pane, the answers reach a button that is far down the list, and each request is pressed once. The real manager
// page is not recorded yet. Needs the browser build: `pnpm exec camoufox fetch`.

const TOTAL = 14
const FIRST_ROWS = 6
const MORE_ROWS = 4

const person = (index: number) => ({
   id: `75207529307029831${String(index).padStart(2, '0')}`,
   slug: `person-${index}`,
   name: `Person Number${index}`,
   headline: `Works at Company ${index}`,
})

const data = JSON.stringify({
   rows: Array.from({ length: TOTAL }, (_, index) => invitationRow(person(index + 1))),
   first: FIRST_ROWS,
   more: MORE_ROWS,
})

const PAGE = `<!doctype html><html><body style="margin:0;font:14px sans-serif">
<div id="pane" style="height:450px;width:700px;overflow:auto"><div role="list" data-testid="lazy-column" id="list"></div><div id="end" style="height:20px"></div></div>
<style>[role="listitem"]{height:140px;border-bottom:1px solid #999;overflow:hidden}</style>
<script>
const DATA = ${data}
let shown = 0
const list = document.getElementById('list')
const pane = document.getElementById('pane')
function wire(row) {
  const id = /invitation:(\\d+)/.exec(row.getAttribute('componentkey'))[1]
  for (const button of row.querySelectorAll('button[aria-label^="Accept "], button[aria-label^="Ignore an invitation"]')) {
    button.onclick = () => {
      fetch('/answer?id=' + id + '&action=' + (button.getAttribute('aria-label').startsWith('Accept') ? 'accept' : 'ignore'))
      setTimeout(() => row.remove(), 300)
    }
  }
}
function addRows(count) {
  const end = Math.min(DATA.rows.length, shown + count)
  while (shown < end) { list.insertAdjacentHTML('beforeend', DATA.rows[shown]); wire(list.lastElementChild); shown += 1 }
}
addRows(DATA.first)
pane.addEventListener('scroll', () => { if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 40) addRows(DATA.more) })
</script></body></html>`

let server: Server
let origin: string
const answers: string[] = []

beforeAll(async () => {
   server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost')

      if (url.pathname === '/answer') {
         answers.push(`${url.searchParams.get('action')} ${url.searchParams.get('id')}`)
         response.writeHead(204)
         response.end()

         return
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(PAGE)
   })
   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

describe('runInvitations in a real browser, against a stand-in for the connection requests', () => {
   it('should scroll the list for every request, press the buttons asked for once each, and read the rest', async () => {
      const driver = new CamoufoxDriver({
         actionTimeoutMs: 10_000,
         isAllowedNavigation: () => true,
      })
      const browser = await driver.open()
      const attached: Record<string, string> = {}
      const warnings: string[] = []
      let time = 0

      try {
         const result = await runInvitations(
            {
               browser,
               visit: url => browser.goto(url),
               // Pauses are counted, and only a little of each is waited for, so the page has time to answer.
               pause: async ms => {
                  time += ms
                  await new Promise(resolve => setTimeout(resolve, Math.min(ms, 250)))
               },
               log: () => undefined,
               warn: message => warnings.push(message),
               attach: (name, content) => {
                  attached[name] = content
               },
               markAttempt: async () => true,
            },
            origin,
            {
               answers: [
                  {
                     id: person(12).id,
                     action: 'ACCEPT',
                  },
                  {
                     id: person(2).id,
                     action: 'IGNORE',
                  },
               ],
            },
            {
               random: () => 0.5,
               now: () => time,
            }
         )

         expect(warnings).toEqual([])
         expect(answers).toEqual([`accept ${person(12).id}`, `ignore ${person(2).id}`])
         expect(result).toEqual({
            outcome: 'DONE',
            read: TOTAL - 2,
            asked: 2,
            answered: 2,
         })

         const file = invitationsFileSchema.parse(JSON.parse(attached['invitations.json'] ?? 'null'))

         expect(file.outcomes.map(({ outcome }) => outcome)).toEqual(['ACCEPTED', 'IGNORED'])
         expect(file.invitations.map(({ id }) => id)).not.toContain(person(2).id)
         expect(file.invitations).toHaveLength(TOTAL - 2)
      } finally {
         await browser.close()
      }
   })
})
