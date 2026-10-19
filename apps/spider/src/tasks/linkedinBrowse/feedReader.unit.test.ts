import { describe, expect, it } from 'vitest'

import { type InspectedBlock, type InspectedElement, type PageInspection } from '../../scraping/driver'
import { DIALOG, NEVER_CLICK, POST_BLOCK, authorOf, authorOnPage, imageOf, postAddress, readFeed } from './feedReader'

const BASE = 'https://www.linkedin.com'

const link = (href: string, over: Partial<InspectedElement> = {}): InspectedElement => ({
   tag: 'a',
   href,
   text: 'x',
   label: '',
   role: '',
   view: '',
   box: {
      x: 300,
      y: 300,
      width: 100,
      height: 20,
   },
   inView: true,
   covered: false,
   path: [],
   ...over,
})

const actor = (href: string, over: Partial<InspectedElement> = {}) =>
   link(href, {
      view: 'feed-actor',
      ...over,
   })

// A post as the real feed marks it: its id in a component key, an action bar, and its author link.
const post = (id: string, author: string, over: Partial<InspectedBlock> = {}): InspectedBlock => ({
   keys: [`translatable-commentary-FeTranslationUrn(contentUrnUgcPostUrn=(userGeneratedContentId=${id})), x=y`],
   marks: ['feed-commentary', 'reaction-button', 'feed-actor'],
   links: [actor(`${BASE}/in/${author}/`)],
   ...over,
})

const feed = (blocks: InspectedBlock[], links: InspectedElement[] = []): PageInspection => ({
   url: `${BASE}/feed/`,
   title: 'Feed',
   viewport: {
      width: 1280,
      height: 720,
   },
   scrollY: 0,
   links,
   controls: [],
   blocks,
})

describe('postAddress', () => {
   it('should build the address of a post from the id its markup carries', () => {
      expect(postAddress(BASE, ['x-userGeneratedContentId=7515779955943911424), y'])).toBe(
         `${BASE}/feed/update/urn:li:ugcPost:7515779955943911424/`
      )
      expect(postAddress(BASE, ['header-urn:li:activity:7517821287675764736-0'])).toBe(
         `${BASE}/feed/update/urn:li:activity:7517821287675764736/`
      )
   })

   it('should read the id of a shared post and of a post that has comments', () => {
      expect(postAddress(BASE, ['x=ContentUrnShareUrn(shareUrn=ShareUrn(shareId=7517839885874049024)), y'])).toBe(
         `${BASE}/feed/update/urn:li:share:7517839885874049024/`
      )
      expect(
         postAddress(BASE, ['replaceableComment_urn:li:comment:(activity:7517200604105043968,7517715078528266240)'])
      ).toBe(`${BASE}/feed/update/urn:li:activity:7517200604105043968/`)
   })

   it('should answer undefined when no key holds a post id', () => {
      expect(postAddress(BASE, ['auto-component-02077c50', 'expandedZG_5v6'])).toBeUndefined()
   })
})

describe('authorOf', () => {
   it('should take the author link of the feed, not a mention, a commenter or a nobody', () => {
      const links = [
         link(`${BASE}/in/mentioned/`, { path: ['span', 'p[data-view-name=feed-commentary]'] }),
         link(`${BASE}/in/commenter/`, { path: ['div', 'div[data-view-name=comment-container]'] }),
         link('https://evil.example/in/other/', { view: 'feed-actor' }),
         actor(`${BASE}/company/acme/`),
      ]

      expect(authorOf(links, BASE)?.href).toBe(`${BASE}/company/acme/`)
   })

   it('should fall back to the first member link outside a mention or a comment', () => {
      const links = [
         link(`${BASE}/in/mentioned/`, { path: ['p[data-view-name=feed-commentary]'] }),
         link(`${BASE}/in/ada/`),
      ]

      expect(authorOf(links, BASE)?.href).toBe(`${BASE}/in/ada/`)
   })

   it('should say nobody when the block links to no member or company', () => {
      expect(authorOf([link(`${BASE}/feed/`)], BASE)).toBeUndefined()
   })
})

describe('authorOnPage', () => {
   it('should take the first member link of the page that is not the own profile, a mention, a reaction or a comment', () => {
      const links = [
         link(`${BASE}/in/me-slug/`),
         link(`${BASE}/in/me/`),
         link(`${BASE}/in/mentioned/`, { path: ['p', 'span[data-testid=expandable-text-box]'] }),
         link(`${BASE}/in/reacted/`, { path: ['div[data-testid=ReactionFacepileCollection-urn:li:activity:75]'] }),
         link('https://evil.example/in/x/'),
         link(`${BASE}/in/author/`),
         link(`${BASE}/in/commenter/`),
      ]

      expect(authorOnPage(links, BASE, `${BASE}/in/me-slug/`)?.href).toBe(`${BASE}/in/author/`)
   })

   it('should say nobody when the page links to no other member', () => {
      expect(authorOnPage([link(`${BASE}/in/me-slug/`)], BASE, `${BASE}/in/me-slug/`)).toBeUndefined()
   })
})

describe('imageOf', () => {
   const big = {
      x: 300,
      y: 400,
      width: 480,
      height: 300,
   }

   it('should take the big link back to the feed, not the reactions count, the article card, the send link or a small one', () => {
      const links = [
         link(`${BASE}/feed/foryou/`, {
            view: 'view-likers',
            box: {
               ...big,
               height: 40,
            },
         }),
         link(`${BASE}/feed/foryou/`, {
            view: 'feed-article',
            box: big,
         }),
         link(`${BASE}/feed/foryou/`, {
            box: {
               x: 300,
               y: 300,
               width: 40,
               height: 40,
            },
         }),
         link(`${BASE}/feed/foryou/`, { box: big }),
         link(`${BASE}/in/ada/`, { box: big }),
      ]

      expect(imageOf(links, BASE)?.box).toEqual(big)
      expect(imageOf(links.slice(0, 3), BASE)).toBeUndefined()
   })

   it('should leave out a big link that is not to the feed', () => {
      expect(
         imageOf([link(`${BASE}/jobs/`, { box: big }), link('https://evil.example/feed/', { box: big })], BASE)
      ).toBeUndefined()
   })
})

describe('readFeed', () => {
   it('should read the posts that can be opened, in the order of the page', () => {
      const { posts } = readFeed(feed([post('7000000000000000001', 'ada'), post('7000000000000000002', 'grace')]), BASE)

      expect(
         posts.map(({ url, authorHref }) => ({
            url,
            authorHref,
         }))
      ).toEqual([
         {
            url: `${BASE}/feed/update/urn:li:ugcPost:7000000000000000001/`,
            authorHref: `${BASE}/in/ada/`,
         },
         {
            url: `${BASE}/feed/update/urn:li:ugcPost:7000000000000000002/`,
            authorHref: `${BASE}/in/grace/`,
         },
      ])
   })

   it('should leave out what is not a post of a person: recommendations and promoted posts, and keep a post with no id', () => {
      const { posts } = readFeed(
         feed([
            // "Recommended for you": rows of people to follow, no action bar.
            post('7000000000000000010', 'rec', { marks: ['edge-creation-follow-action', 'feed-call-to-action'] }),
            post('7000000000000000011', 'promo', { marks: ['reaction-button', 'feed-call-to-action'] }),
            post('7000000000000000012', 'ad', { marks: ['reaction-button', 'feed-actor-sub-description-cta'] }),
            post('7000000000000000013', 'banner', { marks: ['feed-promo-image-click'] }),
            post('7000000000000000014', 'noid', { keys: ['auto-component-1'] }),
            post('7000000000000000015', 'real'),
         ]),
         BASE
      )

      // The block with no id is still a post of somebody: it can be opened by its author, not by its address.
      expect(posts.map(({ authorHref, url }) => [authorHref, url])).toEqual([
         [`${BASE}/in/noid/`, undefined],
         [`${BASE}/in/real/`, `${BASE}/feed/update/urn:li:ugcPost:7000000000000000015/`],
      ])
   })

   it('should keep a post that links to no author, and say where its header can be hovered when it has one', () => {
      const { posts } = readFeed(
         feed([
            post('7000000000000000020', 'x', { links: [] }),
            post('7000000000000000021', 'ada', {
               links: [
                  actor(`${BASE}/in/ada/`, {
                     box: {
                        x: 330,
                        y: 600,
                        width: 150,
                        height: 20,
                     },
                  }),
               ],
            }),
         ]),
         BASE
      )

      expect(posts[0]).toEqual({
         key: `${BASE}/feed/update/urn:li:ugcPost:7000000000000000020/`,
         url: `${BASE}/feed/update/urn:li:ugcPost:7000000000000000020/`,
         imageSeen: false,
         shown: false,
      })
      expect(posts[1]).toMatchObject({
         authorHref: `${BASE}/in/ada/`,
         header: { box: { y: 600 } },
         imageSeen: false,
         shown: true,
      })
   })

   it('should say a post is not shown when its author link is covered or out of the window', () => {
      const { posts } = readFeed(
         feed([
            post('7000000000000000030', 'a', { links: [actor(`${BASE}/in/a/`, { covered: true })] }),
            post('7000000000000000031', 'b', { links: [actor(`${BASE}/in/b/`, { inView: false })] }),
         ]),
         BASE
      )

      expect(posts.map(({ shown }) => shown)).toEqual([false, false])
   })

   it('should say a post shows its image when enough of it is in the window and nothing covers it', () => {
      const withImage = (y: number, over: Partial<InspectedElement> = {}) =>
         post('7000000000000000060', 'a', {
            links: [
               actor(`${BASE}/in/a/`),
               link(`${BASE}/feed/foryou/`, {
                  box: {
                     x: 300,
                     y,
                     width: 480,
                     height: 300,
                  },
                  ...over,
               }),
            ],
         })
      const seen = (block: InspectedBlock) => readFeed(feed([block]), BASE).posts[0]?.imageSeen

      expect(seen(withImage(300))).toBe(true)
      // 100 px of it show at the bottom of a window 720 px high.
      expect(seen(withImage(620))).toBe(false)
      expect(seen(withImage(1000))).toBe(false)
      expect(seen(withImage(300, { covered: true }))).toBe(false)
   })

   it('should leave out a block that has neither an id nor an author link', () => {
      const { posts } = readFeed(
         feed([
            post('7000000000000000050', 'x', {
               keys: [],
               links: [],
            }),
         ]),
         BASE
      )

      expect(posts).toEqual([])
   })

   it('should know the own profile from the link of the account card, so it is never opened as an author', () => {
      const reading = readFeed(
         feed(
            [post('7000000000000000040', 'me')],
            [link(`${BASE}/in/me-slug/`, { view: 'identity-self-profile' }), link(`${BASE}/in/other/`)]
         ),
         BASE
      )

      expect(reading.own).toBe(`${BASE}/in/me-slug/`)
   })

   it('should never click inside a button, a menu or a follow action', () => {
      expect(DIALOG).toContain('dialog[open]')
      expect(DIALOG).toContain(':not([aria-hidden="true"])')
      expect(NEVER_CLICK).toContain('button')
      expect(NEVER_CLICK).toContain('[data-view-name="edge-creation-follow-action"]')
      expect(POST_BLOCK).toBe('[data-view-name="feed-full-update"]')
   })
})
