import { describe, expect, it, vi } from 'vitest'

import { type InspectedBlock, type InspectedElement, type PageInspection } from '../../scraping/driver'
import { VisitError } from '../defineTask'
import { browseLinkedin } from './browse'
import { DIALOG, DISMISS, NEVER_CLICK } from './feedReader'

const BASE = 'https://www.linkedin.com'
const FEED = `${BASE}/feed/`
const OWN = `${BASE}/in/ada-lovelace/`
const LOGIN = `${BASE}/uas/login`

const idOf = (n: number) => `7000000000000000${String(n).padStart(3, '0')}`
const postUrl = (n: number) => `${BASE}/feed/update/urn:li:ugcPost:${idOf(n)}/`
const authorUrl = (n: number) => `${BASE}/in/author-${n}/`

const element = (href: string, over: Partial<InspectedElement> = {}): InspectedElement => ({
   tag: 'a',
   href,
   text: 'x',
   label: '',
   role: '',
   view: '',
   box: {
      x: 400,
      y: 200,
      width: 120,
      height: 20,
   },
   inView: true,
   covered: false,
   path: [],
   ...over,
})

// A post as the real feed marks it up; the rest of the blocks are what a feed also holds.
const post = (n: number): InspectedBlock => ({
   keys: [`commentary-(userGeneratedContentId=${idOf(n)})`],
   marks: ['feed-commentary', 'reaction-button', 'feed-actor'],
   links: [element(authorUrl(n), { view: 'feed-actor' })],
})
const recommendations: InspectedBlock = {
   keys: [`row-(userGeneratedContentId=${idOf(901)})`],
   marks: ['edge-creation-follow-action', 'feed-call-to-action'],
   links: [element(`${BASE}/in/recommended/`, { view: 'feed-actor' })],
}
const promoted: InspectedBlock = {
   keys: [`ad-(userGeneratedContentId=${idOf(902)})`],
   marks: ['reaction-button', 'feed-call-to-action'],
   links: [element(`${BASE}/company/advertiser/`, { view: 'feed-actor' })],
}
const ownPost: InspectedBlock = {
   keys: [`mine-(userGeneratedContentId=${idOf(903)})`],
   marks: ['reaction-button'],
   links: [element(OWN, { view: 'feed-actor' })],
}

const inspection = (url: string, blocks: InspectedBlock[], extra: InspectedElement[] = []): PageInspection => ({
   url,
   title: '',
   viewport: {
      width: 1280,
      height: 720,
   },
   scrollY: 0,
   links: [element(OWN, { view: 'identity-self-profile' }), ...extra],
   controls: [],
   blocks,
})

type Options = {
   // The posts the feed shows, besides the recommendations, the promoted post and the own post.
   posts?: number[]
   // Whether the own post shows among the others.
   showOwn?: boolean
   // Whether the posts of the feed hold no id in their markup, so only their authors can be opened.
   noIds?: boolean
   // Whether each post shows a big image, which opens the post in a window over the feed.
   images?: boolean
   // Whether the window cannot be closed.
   stuck?: boolean
   // Whether the window ignores Escape and closes only by its close button.
   escapeFails?: boolean
   // Whether a post page is scrolled away from its header when it opens, so the page has to be scrolled back up to it.
   headerAway?: boolean
   redirects?: Record<string, string>
   // The addresses a click on a link cannot open.
   refusing?: (href: string) => boolean
   // Where going back leads, when it is not to the page before.
   backTo?: string
   pauseMs?: (ms: number) => number
}

const setup = (options: Options = {}) => {
   const {
      posts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      showOwn = true,
      noIds = false,
      redirects = {},
      refusing = () => false,
   } = options
   let headerAway = false
   let windowOpen = false
   const history: string[] = []
   let time = 0
   const visited: Array<{ url: string; at: number }> = []
   const attached: string[] = []
   const current = () => history.at(-1) ?? ''
   const imageOf = (n: number) =>
      element(FEED, {
         box: {
            x: 300,
            y: 300 + n,
            width: 480,
            height: 300,
         },
         covered: windowOpen,
      })
   const pageOf = (url: string) => {
      const found = /ugcPost:(\d+)\/$/.exec(url)

      if (found) {
         const n = Number(found[1].slice(-3))
         // A post page marks nothing: its author is one of the plain links of the page.
         const author = element(authorUrl(n))

         return inspection(
            url,
            [],
            [
               headerAway
                  ? {
                       ...author,
                       inView: false,
                       box: {
                          ...author.box,
                          y: -300,
                       },
                    }
                  : author,
            ]
         )
      }

      return url === FEED
         ? inspection(url, [
              recommendations,
              promoted,
              ...[...posts.map(post), ...(showOwn ? [ownPost] : [])].map((block, index) => ({
                 ...block,
                 keys: noIds ? [] : block.keys,
                 links: options.images ? [...block.links, imageOf(index)] : block.links,
              })),
           ])
         : inspection(url, [])
   }

   const context = {
      browser: {
         scrollBy: vi.fn(async (pixels: number) => {
            if (pixels < 0) {
               headerAway = false
            }

            return true
         }),
         inspect: vi.fn(async (inspecting?: { block?: string }) => {
            const page = pageOf(current())

            return inspecting?.block === DIALOG
               ? {
                    ...page,
                    blocks: windowOpen
                       ? [
                            {
                               keys: [],
                               marks: [],
                               links: [],
                            },
                         ]
                       : [],
                 }
               : page
         }),
         clickInside: vi.fn(async (_box: InspectedElement['box'], _avoid: string) => {
            windowOpen = true

            return true
         }),
         press: vi.fn(async (key: string) => {
            windowOpen = key !== 'Escape' || options.stuck === true || options.escapeFails === true
         }),
         clickLink: vi.fn(async (href: string, _avoid: string) => {
            if (refusing(href)) {
               return undefined
            }

            history.push(href)

            return href
         }),
         back: vi.fn(async () => {
            history.pop()

            return options.backTo ?? current()
         }),
         hover: vi.fn(async (_x: number, _y: number) => undefined),
         drift: vi.fn(async () => undefined),
         clickSelector: vi.fn(async (selector: string) => {
            if (selector === DISMISS && !options.stuck) {
               windowOpen = false
            }

            return selector === DISMISS
         }),
         exists: vi.fn(async () => false),
         click: vi.fn(async () => FEED),
         clearCookies: vi.fn(async () => undefined),
         pageHtml: vi.fn(async () => '<html></html>'),
      },
      visit: vi.fn(async (url: string) => {
         const landed = redirects[url] ?? url

         history.push(landed)
         windowOpen = false
         headerAway = options.headerAway === true && landed.includes('/feed/update/')
         visited.push({
            url,
            at: time,
         })

         return landed
      }),
      pause: vi.fn(async (ms: number) => {
         time += options.pauseMs ? options.pauseMs(ms) : ms
      }),
      log: vi.fn(),
      warn: vi.fn(),
      attach: vi.fn((name: string) => {
         attached.push(name)
      }),
      screenshot: vi.fn(async () => undefined),
   }

   return {
      context,
      visited,
      attached,
      urls: () => context.visit.mock.calls.map(([url]) => url),
      clicked: () => context.browser.clickLink.mock.calls.map(([href]) => href),
      browse: (random: () => number, snapshots = false) =>
         browseLinkedin(context as never, BASE, random, snapshots, () => time),
   }
}

// Every draw is the same: 0 plans five posts opened by address, .4 six profiles, .99 eight posts and the author of each.
const always = (value: number) => () => value

describe('browseLinkedin', () => {
   it('should read the feed for two minutes, then open five posts by their address and come back from each', async () => {
      const { browse, urls, visited, context } = setup()

      await expect(browse(always(0))).resolves.toBe('DONE')

      expect(urls()).toEqual([FEED, postUrl(1), postUrl(2), postUrl(3), postUrl(4), postUrl(5), FEED])
      // The first target is begun only after the feed was read for the planned time.
      expect(visited[1]?.at).toBeGreaterThanOrEqual(120_000)
      expect(context.browser.back).toHaveBeenCalledTimes(5)
      expect(context.browser.clickLink).not.toHaveBeenCalled()
   })

   it('should rest the pointer on the header of a post before it opens it', async () => {
      const { browse, context } = setup()

      await browse(always(0))

      expect(context.browser.hover).toHaveBeenCalledWith(460, 210)
   })

   it('should open a post that shows an image in its window, read it, and close it with Escape, without leaving the feed', async () => {
      const { browse, urls, attached, context } = setup({ images: true })

      await expect(browse(always(0), true)).resolves.toBe('DONE')

      expect(urls()).toEqual([FEED, FEED])
      expect(context.browser.clickInside).toHaveBeenCalledTimes(5)
      expect(context.browser.clickInside.mock.calls.every(([, avoid]) => avoid === NEVER_CLICK)).toBe(true)
      expect(context.browser.press).toHaveBeenCalledWith('Escape')
      expect(context.browser.back).not.toHaveBeenCalled()
      expect(attached).toContain('window.html')
   })

   it('should go on to the author of a post it read in its window, once the window is closed', async () => {
      const { browse, clicked, context } = setup({ images: true })

      await expect(browse(always(0.99))).resolves.toBe('DONE')

      expect(context.browser.clickInside).toHaveBeenCalled()
      expect(clicked().length).toBeGreaterThanOrEqual(3)
      expect(clicked()[0]).toMatch(/\/in\/author-\d+\/$/)
      expect(context.browser.back).toHaveBeenCalledTimes(clicked().length)
   })

   it('should press the close button of the window when Escape does nothing', async () => {
      const { browse, context } = setup({
         images: true,
         escapeFails: true,
      })

      await expect(browse(always(0))).resolves.toBe('DONE')

      expect(context.browser.clickSelector).toHaveBeenCalledWith(DISMISS)
      expect(context.warn).not.toHaveBeenCalled()
   })

   it('should say so and go by authors when a window will not close', async () => {
      const { browse, clicked, context } = setup({
         images: true,
         stuck: true,
      })

      await expect(browse(always(0))).resolves.toBe('DONE')

      expect(context.warn).toHaveBeenCalledWith('The window of the post would not close.')
      expect(clicked().length).toBeGreaterThan(0)
   })

   it('should open the profile of who posted, by clicking its link, never inside a button', async () => {
      const { browse, urls, clicked, context } = setup()

      await expect(browse(always(0.4))).resolves.toBe('DONE')

      expect(clicked()).toHaveLength(6)
      expect(new Set(clicked()).size).toBe(6)
      expect(context.browser.clickLink.mock.calls.every(([, avoid]) => avoid === NEVER_CLICK)).toBe(true)
      expect(urls()).toEqual([FEED, FEED])
      expect(context.browser.back).toHaveBeenCalledTimes(6)
   })

   it("should never open a recommendation, a promoted post or the own profile as someone else's", async () => {
      const { browse, clicked } = setup()

      await browse(always(0.4))

      expect(clicked()).not.toContain(OWN)
      expect(clicked()).not.toContain(`${BASE}/in/recommended/`)
      expect(clicked()).not.toContain(`${BASE}/company/advertiser/`)
   })

   it('should open a post, then the profile of who posted it, then come back through both pages', async () => {
      const { browse, urls, clicked, context } = setup()

      await expect(browse(always(0.99))).resolves.toBe('DONE')

      // The longest stays of every day: the time is used up before all eight targets, and no new one is begun then.
      const posts = urls().slice(1, -1)

      expect(posts.length).toBeGreaterThanOrEqual(3)
      expect(clicked()).toHaveLength(posts.length)
      // The author of each post is the one on its own page.
      expect(clicked()[0]).toMatch(/\/in\/author-\d+\/$/)
      expect(context.browser.back).toHaveBeenCalledTimes(posts.length * 2)
   })

   it('should scroll a post page back up to its header before it clicks through to the author', async () => {
      const { browse, clicked, context } = setup({ headerAway: true })

      await expect(browse(always(0.99))).resolves.toBe('DONE')

      expect(clicked().length).toBeGreaterThanOrEqual(3)
      expect(context.browser.scrollBy.mock.calls.some(([pixels]) => pixels < 0)).toBe(true)
   })

   it('should scroll toward the nearest post it can use, up when it was passed and down when it is still to come', async () => {
      const header = (y: number) => [
         element(authorUrl(1), {
            view: 'feed-actor',
            inView: false,
            box: {
               x: 400,
               y,
               width: 120,
               height: 20,
            },
         }),
      ]
      const passed = setup()

      passed.context.browser.inspect.mockResolvedValueOnce(
         inspection(FEED, [
            {
               ...post(1),
               links: header(-600),
            },
         ])
      )

      await expect(passed.browse(always(0))).resolves.toBe('DONE')

      // The first look after the read: the post is 600 px above, so the page goes up to it.
      const afterRead = passed.context.browser.scrollBy.mock.calls.findIndex(([pixels]) => pixels < 0)

      expect(afterRead).toBeGreaterThan(0)
      expect(passed.context.browser.scrollBy.mock.calls[afterRead]?.[0]).toBeLessThanOrEqual(-150)
      expect(passed.urls()[1]).toBe(postUrl(1))

      const ahead = setup()

      ahead.context.browser.inspect.mockResolvedValueOnce(
         inspection(FEED, [
            {
               ...post(1),
               links: header(1500),
            },
         ])
      )

      await ahead.browse(always(0))

      // Below the window: the page goes down by about the distance, at most 900 px at a time.
      expect(ahead.context.browser.scrollBy.mock.calls.some(([pixels]) => pixels === 900)).toBe(true)
   })

   it('should go by the author when the feed shows no post it can open by its address', async () => {
      const { browse, urls, clicked } = setup({ noIds: true })

      // Every target is planned as a post by its address.
      await expect(browse(always(0))).resolves.toBe('DONE')

      expect(urls().filter(url => url.includes('/feed/update/'))).toEqual([])
      expect(clicked()).toHaveLength(5)
   })

   it('should answer signed out when a post page asks for a sign-in', async () => {
      const { browse } = setup({ redirects: { [postUrl(1)]: LOGIN } })

      await expect(browse(always(0))).resolves.toBe('SIGNED_OUT')
   })

   it('should answer signed out when a click ends on a sign-in or a security page', async () => {
      const { browse, context } = setup()

      context.browser.clickLink.mockImplementation(async () => `${BASE}/checkpoint/challenge/x`)

      await expect(browse(always(0.4))).resolves.toBe('SIGNED_OUT')
   })

   it('should stop after four targets in a row that came to nothing, and say nothing could be opened', async () => {
      const { browse, clicked, context } = setup({ refusing: () => true })

      await expect(browse(always(0.4))).resolves.toBe('NO_CYCLE')

      expect(clicked()).toHaveLength(4)
      expect(context.warn).toHaveBeenCalled()
   })

   it('should go on after a target that failed, and count the ones that worked', async () => {
      const { browse, context } = setup()

      context.browser.clickLink.mockImplementationOnce(async () => undefined)

      await expect(browse(always(0.4))).resolves.toBe('DONE')
      expect(context.browser.clickLink).toHaveBeenCalledTimes(6)
   })

   it('should leave post addresses alone once two of them did not open a post, and go on by profiles', async () => {
      const { browse, urls, clicked } = setup({
         redirects: {
            [postUrl(1)]: FEED,
            [postUrl(2)]: FEED,
         },
      })

      await expect(browse(always(0))).resolves.toBe('DONE')

      expect(urls().filter(url => url.includes('/feed/update/'))).toEqual([postUrl(1), postUrl(2)])
      expect(clicked()).toHaveLength(3)
   })

   it('should end with nothing opened when the feed shows no post of a person', async () => {
      const { browse, context } = setup({
         posts: [],
         showOwn: false,
      })

      await expect(browse(always(0))).resolves.toBe('NO_CYCLE')
      expect(context.warn).toHaveBeenCalledWith('The feed showed no post to open')
   })

   it('should begin no new target once the time is used, and still be done with what it opened', async () => {
      const { browse, urls } = setup({ pauseMs: ms => ms * 40 })

      await expect(browse(always(0))).resolves.toBe('DONE')

      const posts = urls().filter(url => url.includes('/feed/update/'))

      expect(posts.length).toBeGreaterThanOrEqual(1)
      expect(posts.length).toBeLessThan(5)
   })

   it('should open the feed again when going back does not lead to it', async () => {
      const { browse, urls } = setup({ backTo: `${BASE}/jobs/` })

      await browse(always(0))

      // The first feed, one more after each of the five posts, and the last check.
      expect(urls().filter(url => url === FEED)).toHaveLength(7)
   })

   it('should keep the feed, the first post and the first profile for study when asked to, and nothing otherwise', async () => {
      const kept = setup()

      await kept.browse(always(0.99), true)

      expect(kept.attached).toEqual([
         'feed.html',
         'feed.inspect.json',
         'post.html',
         'post.inspect.json',
         'profile.html',
         'profile.inspect.json',
      ])

      const plain = setup()

      await plain.browse(always(0.99))

      expect(plain.attached).toEqual([])
   })

   it('should stop with SIGNED_OUT when the feed asks for a sign-in', async () => {
      const { browse, urls } = setup({ redirects: { [FEED]: LOGIN } })

      await expect(browse(always(0))).resolves.toBe('SIGNED_OUT')
      expect(urls()).toEqual([FEED])
   })

   it('should drop the token and answer SIGNED_OUT when the feed goes round in circles', async () => {
      const { browse, context } = setup()

      context.visit.mockRejectedValueOnce(new VisitError('load', 'The page did not load.'))
      context.visit.mockResolvedValueOnce(LOGIN)

      await expect(browse(always(0))).resolves.toBe('SIGNED_OUT')
      expect(context.browser.clearCookies).toHaveBeenCalledWith('li_at')
   })

   it('should let a feed that loads neither way fail as an error', async () => {
      const { browse, context } = setup()

      context.visit.mockRejectedValue(new VisitError('load', 'The page did not load.'))

      await expect(browse(always(0))).rejects.toThrow('The page did not load.')
   })

   it('should say a browser that cannot click links cannot browse', async () => {
      const { browse, context } = setup()

      Reflect.deleteProperty(context.browser, 'clickLink')

      await expect(browse(always(0))).rejects.toThrow('cannot browse by clicking')
   })
})
