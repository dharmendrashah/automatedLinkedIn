import { describe, expect, it, vi } from 'vitest'

import {
   POST_AUDIENCE_CHIP,
   POST_BUTTON,
   POST_COMMENTS_CHIP,
   POST_COMMENT_OPTIONS,
   POST_EDITOR,
   POST_OPTION,
   POST_START,
} from '../../linkedin/markup'
import { composerMarkup, postedMarkup } from '../../linkedin/postFixture'
import { sendPost } from './post'

const BASE = 'https://www.linkedin.com'
const TEXT = 'Shipping the posting task today. https://example.com/post'
const ACTIVITY = `${BASE}/feed/update/urn:li:activity:7520195721216827392/`
const SHARE = `${BASE}/feed/update/urn:li:share:7520195720021266433/`
const ROWS = ['Anyone', 'Connections only', 'Group']
const COMMENT_NAMES: Record<string, string> = {
   ANYONE: 'Anyone',
   CONNECTIONS: 'Connections only',
   OFF: 'Off',
}

type Page = {
   at?: string
   audience?: string
   comments?: string
   // A click on a row of the audience pop-up changes nothing; the pop-up shows no row at all; a click on a comment row changes nothing.
   audienceStuck?: boolean
   noRows?: boolean
   commentsStuck?: boolean
   // How many looks at the page find the box not drawn yet, as through a slow proxy; a huge number never draws it.
   slowPage?: number
   // The compose address draws the feed with no composer, as on staging (LinkedIn's page failed to hydrate): the composer comes only
   // once "Start a post" is pressed, on this page ('here') or on the feed after it was opened ('feed'), or never.
   needsStart?: 'here' | 'feed' | 'never'
   // The typing reaches the box.
   typingWorks?: boolean
   // The Post button comes alive once there are words.
   postWorks?: boolean
   // A click on Post does not land.
   clickFails?: boolean
   // After Post: the page says the post went at once, after some looks, or never; with its address or without.
   says?: 'now' | 'late' | 'never'
   link?: boolean
   // How many looks at the page, after Post, cannot read it (the page is moving).
   unreadable?: number
}

const setup = (page: Page = {}) => {
   const { at = `${BASE}/sharing/compose`, typingWorks = true, postWorks = true } = page
   const { says = 'now', link = true, clickFails = false } = page
   let audience = page.audience ?? 'Anyone'
   let comments = page.comments ?? 'Anyone'
   let open = false
   let waiting = page.slowPage ?? 0
   let started = false
   let onFeed = false
   let unreadable = page.unreadable ?? 0
   let looks = 0
   let focused = false
   let pressed = false
   let typed: string[] = []
   const calls: string[] = []
   const posted: string[][] = []
   const html = () => {
      if (pressed && unreadable > 0) {
         unreadable -= 1

         throw new Error('The page is moving')
      }

      if (waiting > 0) {
         waiting -= 1

         return composerMarkup({ noEditor: true })
      }

      if (page.needsStart && !started) {
         return composerMarkup({ noEditor: true })
      }

      if (pressed) {
         looks += 1

         const shows = says === 'now' || (says === 'late' && looks >= 4)

         return shows
            ? postedMarkup(
                 link
                    ? {
                         window: SHARE,
                         toast: ACTIVITY,
                      }
                    : {}
              )
            : composerMarkup({
                 typed,
                 audience,
                 comments,
                 busy: true,
              })
      }

      return composerMarkup({
         typed,
         audience,
         comments,
         popup: open && !page.noRows ? ROWS : [],
         disabled: typed.length === 0 || !postWorks,
      })
   }
   const browser = {
      pageHtml: vi.fn(async () => html()),
      inspect: vi.fn(async () => ({
         url: at,
         title: '',
         viewport: {
            width: 1280,
            height: 720,
         },
         scrollY: 0,
         links: [],
         controls: [],
         blocks: [],
      })),
      clickLink: vi.fn(async () => undefined),
      back: vi.fn(async () => at),
      exists: vi.fn(async () => false),
      click: vi.fn(async () => at),
      scrollBy: vi.fn(async () => true),
      press: vi.fn(async (key: string) => {
         calls.push(`press ${key}`)

         if (key === 'Delete') {
            typed = []
         }

         if (key === 'Escape') {
            open = false
         }

         return ''
      }),
      clickNth: vi.fn(async (selector: string, index: number) => {
         if (selector !== POST_OPTION || !open) {
            return false
         }

         calls.push(`pick row ${index}`)
         open = false

         if (!page.audienceStuck) {
            audience = ROWS[index] ?? audience
         }

         return true
      }),
      clickSelector: vi.fn(async (selector: string) => {
         if (selector === POST_AUDIENCE_CHIP) {
            calls.push('open audience')
            open = true

            return true
         }

         if (selector === POST_COMMENTS_CHIP) {
            calls.push('open comments')

            return true
         }

         const commentRow = Object.entries(POST_COMMENT_OPTIONS).find(([, value]) => value === selector)

         if (commentRow) {
            calls.push(`pick comments ${commentRow[0]}`)

            if (!page.commentsStuck) {
               comments = COMMENT_NAMES[commentRow[0]] ?? comments
            }

            return true
         }

         if (selector === POST_START) {
            calls.push('start a post')
            started = page.needsStart === 'here' || (page.needsStart === 'feed' && onFeed)

            return true
         }

         if (selector === POST_EDITOR) {
            calls.push('click box')
            focused = true

            return true
         }

         if (selector === POST_BUTTON) {
            calls.push('click post')

            if (typed.length === 0 || !postWorks || clickFails) {
               return false
            }

            pressed = true
            posted.push(typed)

            return true
         }

         return false
      }),
      typeKeys: vi.fn(async (text: string) => {
         calls.push('type')

         if (focused && typingWorks) {
            typed = text.split('\n').filter(line => line !== '')
         }
      }),
   }
   const context = {
      browser,
      visit: vi.fn(async (url: string) => {
         onFeed = url.endsWith('/feed/')

         return at
      }),
      pause: vi.fn(async () => undefined),
      log: vi.fn(),
      warn: vi.fn(),
      attach: vi.fn(),
      markAttempt: vi.fn(async () => true),
   }

   return {
      context,
      calls,
      posted,
      send: (input: Partial<Parameters<typeof sendPost>[2]> = {}) =>
         sendPost(
            context as never,
            BASE,
            {
               text: TEXT,
               files: [],
               audience: 'ANYONE',
               comments: 'ANYONE',
               ...input,
            },
            {
               random: () => 0.5,
               now: () => 0,
            }
         ),
   }
}

describe('sendPost', () => {
   it('should type the words, press Post once, and give the address of the post when the page says it went', async () => {
      const { send, calls, posted, context } = setup()

      await expect(send()).resolves.toEqual({
         outcome: 'POSTED',
         link: ACTIVITY,
      })
      expect(calls).toEqual(['click box', 'type', 'click post'])
      expect(posted).toEqual([[TEXT]])
      expect(context.markAttempt).toHaveBeenCalledTimes(1)
      expect(context.visit).toHaveBeenCalledWith(`${BASE}/sharing/compose`)
   })

   it('should wait for a composer that is slow to draw, and for a page that says it went a little late', async () => {
      const { send } = setup({
         slowPage: 5,
         says: 'late',
      })

      await expect(send()).resolves.toEqual({
         outcome: 'POSTED',
         link: ACTIVITY,
      })
   })

   it('should keep looking when the page cannot be read while it moves to the feed', async () => {
      const { send } = setup({ unreadable: 3 })

      await expect(send()).resolves.toMatchObject({ outcome: 'POSTED' })
   })

   it('should accept words of several paragraphs whichever way the box keeps the new lines', async () => {
      const { send, posted } = setup()

      await expect(send({ text: 'One\n\nTwo' })).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(posted).toEqual([['One', 'Two']])
   })

   it('should say the post went with no address when the page says so and shows none', async () => {
      const { send } = setup({ link: false })

      await expect(send()).resolves.toEqual({ outcome: 'POSTED_NO_LINK' })
   })

   it('should say it is not sure, and press Post only once, when the page never says the post went', async () => {
      const { send, calls } = setup({ says: 'never' })

      await expect(send()).resolves.toEqual({ outcome: 'UNKNOWN' })
      expect(calls.filter(call => call === 'click post')).toHaveLength(1)
      expect(calls.filter(call => call === 'type')).toHaveLength(1)
   })

   it('should press Start a post when the compose address shows the feed with no composer, then post', async () => {
      const { send, calls, context } = setup({ needsStart: 'here' })

      await expect(send()).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls).toEqual(['start a post', 'click box', 'type', 'click post'])
      // The page is opened once before the post; the next visits are to the post itself and back to the feed.
      expect(context.visit.mock.calls.map(call => call[0]).slice(0, 2)).toEqual([`${BASE}/sharing/compose`, ACTIVITY])
   })

   it('should go to the feed and press Start a post there when the first press opens nothing', async () => {
      const { send, calls, context } = setup({ needsStart: 'feed' })

      await expect(send()).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls).toEqual(['start a post', 'start a post', 'click box', 'type', 'click post'])
      expect(context.visit.mock.calls.map(call => call[0]).slice(0, 2)).toEqual([
         `${BASE}/sharing/compose`,
         `${BASE}/feed/`,
      ])
   })

   it('should still say there is no composer, and type nothing, when pressing Start a post never opens it', async () => {
      const { send, calls, context } = setup({ needsStart: 'never' })

      await expect(send()).resolves.toEqual({ outcome: 'NO_COMPOSER' })
      expect(calls).toEqual(['start a post', 'start a post'])
      expect(context.markAttempt).not.toHaveBeenCalled()
   })

   it('should say there is no composer, and type nothing, when the box never draws', async () => {
      const { send, calls, context } = setup({ slowPage: 1000 })

      await expect(send()).resolves.toEqual({ outcome: 'NO_COMPOSER' })
      expect(calls).toEqual(['start a post', 'start a post'])
      expect(context.markAttempt).not.toHaveBeenCalled()
   })

   it('should change the audience and who may comment when the account has others, then post', async () => {
      const { send, calls, posted } = setup({
         audience: 'Connections only',
         comments: 'Connections only',
      })

      await expect(send()).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls).toEqual([
         'open audience',
         'pick row 0',
         'open comments',
         'pick comments ANYONE',
         'click box',
         'type',
         'click post',
      ])
      expect(posted).toHaveLength(1)
   })

   it('should leave the settings alone when the account already has the ones asked for', async () => {
      const { send, calls } = setup({ audience: 'Connections only' })

      await expect(send({ audience: 'CONNECTIONS' })).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(calls).toEqual(['click box', 'type', 'click post'])
   })

   it('should type nothing, and say which audience it found, when the audience does not change', async () => {
      const { send, calls, context } = setup({
         audience: 'Connections only',
         audienceStuck: true,
      })

      await expect(send()).resolves.toEqual({
         outcome: 'WRONG_AUDIENCE',
         found: 'Connections only',
      })
      expect(calls).toEqual(['open audience', 'pick row 0'])
      expect(context.markAttempt).not.toHaveBeenCalled()
   })

   it('should close the pop-up and keep its markup for study when it shows no row it can read', async () => {
      const { send, calls, context } = setup({
         audience: 'Connections only',
         noRows: true,
      })

      await expect(send()).resolves.toMatchObject({ outcome: 'WRONG_AUDIENCE' })
      expect(calls).toEqual(['open audience', 'press Escape'])
      expect(context.attach).toHaveBeenCalledWith('audience-popup.html', expect.any(String), 'text/html')
   })

   it('should type nothing when who may comment does not change', async () => {
      const { send, calls, context } = setup({
         comments: 'Connections only',
         commentsStuck: true,
      })

      await expect(send()).resolves.toEqual({ outcome: 'WRONG_COMMENTS' })
      expect(calls).toEqual(['open comments', 'pick comments ANYONE'])
      expect(context.markAttempt).not.toHaveBeenCalled()
   })

   it('should type nothing, and say it is not sure, when this post was started before', async () => {
      const { send, calls, context } = setup()

      context.markAttempt.mockResolvedValue(false)

      await expect(send()).resolves.toEqual({ outcome: 'UNKNOWN' })
      expect(calls).toEqual([])
   })

   it('should empty the box and press nothing when the words do not reach it', async () => {
      const { send, calls } = setup({ typingWorks: false })

      await expect(send()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'TYPING',
      })
      expect(calls).toEqual(['click box', 'type', 'press ControlOrMeta+A', 'press Delete'])
   })

   it('should empty the box and say nothing was posted when the Post button stays greyed', async () => {
      const { send, calls } = setup({ postWorks: false })

      await expect(send()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'POST_DISABLED',
      })
      expect(calls).not.toContain('click post')
      expect(calls.slice(-2)).toEqual(['press ControlOrMeta+A', 'press Delete'])
   })

   it('should say nothing was posted when the click on Post does not land', async () => {
      const { send } = setup({ clickFails: true })

      await expect(send()).resolves.toEqual({
         outcome: 'FAILED',
         why: 'POST_NOT_CLICKED',
      })
   })

   it('should say it is signed out when LinkedIn sends the member to its sign-in', async () => {
      const { send, calls, context } = setup()

      context.visit.mockResolvedValue(`${BASE}/login`)

      await expect(send()).resolves.toEqual({ outcome: 'SIGNED_OUT' })
      expect(calls).toEqual([])
   })

   it('should open the post it made, stay on it for ten seconds, and leave for the feed', async () => {
      const { send, context } = setup()

      await expect(send()).resolves.toMatchObject({ outcome: 'POSTED' })
      expect(context.visit.mock.calls.map(([url]) => url)).toEqual([
         `${BASE}/sharing/compose`,
         ACTIVITY,
         `${BASE}/feed/`,
      ])
      expect(context.pause).toHaveBeenCalledWith(10_000)
   })

   it('should open no post when the page gave no address, and still say it went', async () => {
      const { send, context } = setup({ link: false })

      await expect(send()).resolves.toEqual({ outcome: 'POSTED_NO_LINK' })
      expect(context.visit).toHaveBeenCalledTimes(1)
      expect(context.pause).not.toHaveBeenCalledWith(10_000)
   })

   it('should still say it was posted when the post cannot be opened afterwards', async () => {
      const { send, context } = setup()

      context.visit.mockResolvedValueOnce(`${BASE}/sharing/compose`).mockRejectedValue(new Error('slow'))

      await expect(send()).resolves.toMatchObject({
         outcome: 'POSTED',
         link: ACTIVITY,
      })
      expect(context.warn).toHaveBeenCalled()
   })

   it('should never put the words in the log', async () => {
      const { send, context } = setup()

      await send()

      expect(JSON.stringify([...context.log.mock.calls, ...context.warn.mock.calls])).not.toContain('Shipping')
   })
})
