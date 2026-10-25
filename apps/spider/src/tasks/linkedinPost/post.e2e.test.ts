import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CamoufoxDriver } from '../../scraping/camoufoxDriver'
import { sendPost } from './post'

// Runs a real Camoufox through a stand-in for LinkedIn's post composer, made like the recorded page (2026-10-25): a skeleton first,
// then a rich-text box whose words live in paragraphs, a Post button that is greyed until there are words and while it sends, and
// a success window and toast whose "View post" links give the address. It proves the audience and comment settings are changed by
// clicks and read back, the box is found and typed into for real, the Post button is pressed once, and the address comes back.
// Needs the browser build: `pnpm exec camoufox fetch`.

const ACTIVITY = 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/'
const SHARE = 'https://www.linkedin.com/feed/update/urn:li:share:7520195720021266433/'
const TEXT = 'Shipping the posting task.\nSee https://example.com/post'

const PAGE = `<!doctype html><html><body style="margin:0;font:14px sans-serif">
<div id="screen">loading</div>
<script>
window.posts = []
function draw() {
  document.getElementById('screen').innerHTML = '<dialog open data-testid="dialog"><div data-sdui-screen="ShareCompose">'
    + '<div role="button" id="who" style="width:300px;height:30px"><div aria-label="Post to Connections only"><p>Post to Connections only</p></div></div>'
    + '<div role="button" id="may" style="width:300px;height:30px" data-view-name="share-view-comment-controls-list"><div aria-label="Comments: Connections only"><p>Comments: Connections only</p></div></div>'
    + '<div id="pop"></div>'
    + '<div id="box" contenteditable="true" role="textbox" class="tiptap ProseMirror" componentkey="ShareBox_textEditor" style="width:500px;height:120px;border:1px solid #999"><p><br></p></div>'
    + '<button type="button" data-view-name="share-post" id="post" disabled style="width:120px;height:40px"><span>Post</span></button>'
    + '</div></dialog>'
  const pop = document.getElementById('pop')
  const row = (label, extra) => '<div role="radio" ' + (extra || '') + ' style="width:300px;height:30px;border:1px solid #999"><div><p>' + label + '</p></div></div>'
  document.getElementById('who').addEventListener('click', () => {
    pop.innerHTML = '<div popover="manual" style="position:static;display:block">' + row('Anyone') + row('Connections only') + row('Group') + '</div>'
    pop.querySelectorAll('[role=radio]').forEach(element => element.addEventListener('click', () => {
      document.querySelector('[aria-label^="Post to "]').setAttribute('aria-label', 'Post to ' + element.textContent)
      pop.innerHTML = ''
    }))
  })
  document.getElementById('may').addEventListener('click', () => {
    pop.innerHTML = '<div popover="manual" style="position:static;display:block">' + row('Anyone', 'data-view-name="share-change-comment-anyone"') + row('Connections only', 'data-view-name="share-change-comment-connections"') + '</div>'
    pop.querySelectorAll('[role=radio]').forEach(element => element.addEventListener('click', () => {
      document.querySelector('[aria-label^="Comments: "]').setAttribute('aria-label', 'Comments: ' + element.textContent)
      pop.innerHTML = ''
    }))
  })
  const box = document.getElementById('box')
  const post = document.getElementById('post')
  box.addEventListener('input', () => { post.disabled = box.innerText.trim() === '' })
  post.addEventListener('click', () => {
    window.posts.push(box.innerText)
    post.disabled = true
    post.setAttribute('aria-busy', 'true')
    setTimeout(() => {
      document.getElementById('screen').innerHTML = '<dialog open><div data-sdui-screen="SharingAfterPostNBADat"><div><p>Your post was successful</p><a href="${SHARE}"><p>View post</p></a></div></div>'
        + '<section><div role="alert"><div><p>Post successful.<a href="${ACTIVITY}"><strong>View post</strong></a></p></div></div></section></dialog>'
    }, 400)
  })
}
setTimeout(draw, 600)
</script></body></html>`

let server: Server
let origin: string

beforeAll(async () => {
   server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(PAGE)
   })
   await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
   origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
   await new Promise(resolve => server.close(resolve))
})

describe('sendPost in a real browser, against a stand-in for the composer', () => {
   it('should wait for the box, type the words, press Post once and give the address of the post', async () => {
      const driver = new CamoufoxDriver({
         actionTimeoutMs: 10_000,
         isAllowedNavigation: () => true,
      })
      const browser = await driver.open()
      const warnings: string[] = []

      try {
         const result = await sendPost(
            {
               browser,
               visit: url => browser.goto(`${origin}${new URL(url).pathname}`),
               pause: async ms => {
                  await new Promise(resolve => setTimeout(resolve, Math.min(ms, 300)))
               },
               log: () => undefined,
               warn: message => warnings.push(message),
               attach: () => undefined,
               markAttempt: async () => true,
            },
            origin,
            {
               text: TEXT,
               files: [],
               audience: 'ANYONE',
               comments: 'ANYONE',
            },
            {
               random: () => 0.5,
               now: () => 0,
            }
         )

         expect(warnings).toEqual([])
         expect(result).toEqual({
            outcome: 'POSTED',
            link: ACTIVITY,
         })
      } finally {
         await browser.close()
      }
   }, 60_000)
})
