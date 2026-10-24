import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { messagesFileSchema } from '@automatedLinkedIn/contracts'

import { inboxMarkup, threadMarkup } from '../../linkedin/messagingFixture'
import { CamoufoxDriver } from '../../scraping/camoufoxDriver'
import { readMessages } from './read'

// Runs a real Camoufox through a stand-in for LinkedIn's messages, made like the real page (recorded 2026-10-22): a list whose rows
// are divs with a menu button in them and no link, that loads more rows as it is scrolled to its end; a conversation that opens
// without an address change of its own and loads older messages when it is scrolled to its top. It proves the reading clicks and
// scrolls the right panes for real, never presses a menu button, and reads every message. Needs the browser build:
// `pnpm exec camoufox fetch`.

const CONVERSATIONS = 12
const MESSAGES = 14
const FIRST_ROWS = 6
const MORE_ROWS = 4
const LEVELS = [5, 10, MESSAGES]

const rowOf = (index: number) =>
   inboxMarkup([
      {
         title: `Person ${index}`,
         when: 'Jan 16',
         snippet: `last words ${index}`,
         unread: index === 1,
      },
   ])
      .replace(/^<ul[^>]*>/, '')
      .replace(/<\/ul>$/, '')
      // A click on the menu button of a row must never happen.
      .replace(
         '<button class="msg-thread-actions__control">',
         `<button class="msg-thread-actions__control" onclick="event.stopPropagation();fetch('/menu')">`
      )

const threadOf = (index: number, shown: number) =>
   threadMarkup({
      title: `Person ${index}`,
      profile: `https://www.linkedin.com/in/person-${index}/`,
      messages: Array.from({ length: MESSAGES }, (_, at) => ({
         id: `2-c${index}-m${at}`,
         from: at % 3 === 2 ? ('ME' as const) : ('THEM' as const),
         name: at % 3 === 2 ? 'Tripti Verma' : `Person ${index}`,
         time: '5:18 PM',
         day: at === 0 ? 'Jan 25, 2024' : undefined,
         text: `words ${index}/${at}`,
      })).slice(MESSAGES - shown),
   })

const data = JSON.stringify({
   rows: Array.from({ length: CONVERSATIONS }, (_, index) => rowOf(index)),
   threads: Array.from({ length: CONVERSATIONS }, (_, index) =>
      Object.fromEntries(LEVELS.map(level => [level, threadOf(index, level)]))
   ),
   levels: LEVELS,
   first: FIRST_ROWS,
   more: MORE_ROWS,
})

const PAGE = `<!doctype html><html><body style="margin:0;font:14px sans-serif">
<div id="pane" style="position:absolute;left:0;top:0;width:400px;height:500px;overflow:auto"><ul id="rows" class="msg-conversations-container__conversations-list" style="margin:0;padding:0"></ul><div id="beacon"></div></div>
<div id="thread" style="position:absolute;left:450px;top:0;width:600px"></div>
<style>.msg-conversation-listitem{height:90px;list-style:none;border-bottom:1px solid #999}.msg-s-message-list{height:480px;overflow:auto}.msg-s-event-listitem{margin:12px 0;min-height:110px}</style>
<script>
const DATA = ${data}
let shown = 0
let open = -1
let level = 0
const rows = document.getElementById('rows')
const pane = document.getElementById('pane')
const thread = document.getElementById('thread')
function addRows(count) {
  const end = Math.min(DATA.rows.length, shown + count)
  while (shown < end) { rows.insertAdjacentHTML('beforeend', DATA.rows[shown]); shown += 1 }
  document.getElementById('beacon').innerHTML = shown < DATA.rows.length ? '<div data-test-msg-cross-pillar-visible-beacon=""></div><button>Load more conversations</button>' : ''
  Array.from(rows.children).forEach((row, index) => { row.querySelector('.msg-conversation-listitem__link').onclick = () => openThread(index, true) })
}
function openThread(index, push) {
  open = index
  level = 0
  thread.innerHTML = DATA.threads[index][DATA.levels[0]]
  const list = thread.querySelector('.msg-s-message-list')
  list.scrollTop = list.scrollHeight
  if (push) history.pushState({}, '', '/messaging/thread/c' + index + '/')
}
addRows(DATA.first)
pane.addEventListener('scroll', () => { if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 20) addRows(DATA.more) })
document.addEventListener('scroll', event => {
  const list = event.target
  if (!(list instanceof Element) || !list.classList.contains('msg-s-message-list') || list.scrollTop > 30 || level >= DATA.levels.length - 1) return
  setTimeout(() => {
    if (level >= DATA.levels.length - 1) return
    level += 1
    thread.innerHTML = DATA.threads[open][DATA.levels[level]]
    thread.querySelector('.msg-s-message-list').scrollTop = 250
  }, 150)
}, true)
const at = /thread\\/c(\\d+)/.exec(location.pathname)
setTimeout(() => openThread(at ? Number(at[1]) : 0, false), 200)
</script></body></html>`

let server: Server
let origin: string
const menus: string[] = []

beforeAll(async () => {
   server = createServer((request, response) => {
      if (request.url === '/menu') {
         menus.push('menu')
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

describe('readMessages in a real browser, against a stand-in for the messages', () => {
   it('should open each row by a click, scroll the list and the conversation, and read every message of each', async () => {
      const driver = new CamoufoxDriver({
         actionTimeoutMs: 10_000,
         isAllowedNavigation: () => true,
      })
      const browser = await driver.open()
      const attached: Record<string, string> = {}
      const warnings: string[] = []
      let time = 0

      try {
         const result = await readMessages(
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
               screenshot: async () => undefined,
            },
            origin,
            {
               limit: 7,
               skip: 0,
               known: [],
               snapshots: false,
            },
            {
               random: () => 0.5,
               now: () => time,
               today: () => new Date(Date.UTC(2026, 9, 22)),
            }
         )

         expect(warnings).toEqual([])
         expect(result).toEqual({
            outcome: 'DONE',
            conversations: 7,
            messages: 7 * MESSAGES,
         })

         const { conversations } = messagesFileSchema.parse(JSON.parse(attached['messages.json'] ?? 'null'))

         expect(conversations.map(conversation => conversation.id)).toEqual(
            Array.from({ length: 7 }, (_, index) => `c${index}`)
         )
         expect(
            conversations.every(conversation => conversation.complete && conversation.messages.length === MESSAGES)
         ).toBe(true)
         expect(conversations[6]?.messages[0]).toMatchObject({
            sender: { name: 'Person 6' },
            direction: 'THEM',
            date: '2024-01-25',
            text: 'words 6/0',
         })
         expect(conversations[1]?.unread).toBe(true)
         expect(menus).toEqual([])
      } finally {
         await browser.close()
      }
   })
})
