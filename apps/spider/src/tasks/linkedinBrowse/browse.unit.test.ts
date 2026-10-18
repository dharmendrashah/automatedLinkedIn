import { describe, expect, it, vi } from 'vitest'

import { VisitError } from '../defineTask'
import { authorLink, browseLinkedin, postLinks } from './browse'

const BASE = 'https://www.linkedin.com'
const OWN = `${BASE}/in/ada-lovelace/`
const POST_1 = `${BASE}/feed/update/urn:li:activity:7001/`
const POST_2 = `${BASE}/feed/update/urn:li:activity:7002/`

const feedHtml = `<a href="/in/ada-lovelace/">Me</a><div><a href="/feed/update/urn:li:activity:7001/">post</a><a href="${POST_2}?utm=x&amp;y=1">post</a><a href="/feed/update/urn:li:activity:7001/">again</a></div>`
const postHtml = (author: string) =>
   `<header><a href="/in/ada-lovelace/">Me</a></header><a href="${author}">Author</a><a href="/in/commenter/">c</a>`

const setup = (pages: Record<string, string> = {}, html: Record<string, string> = {}) => {
   let at = ''
   const context = {
      browser: {
         scrollBy: vi.fn(async () => true),
         pageHtml: vi.fn(async () => html[at] ?? ''),
         exists: vi.fn(async () => false),
         click: vi.fn(async () => at),
      },
      visit: vi.fn(async (url: string) => {
         at = pages[url] ?? url

         return at
      }),
      pause: vi.fn(async () => undefined),
      log: vi.fn(),
      warn: vi.fn(),
   }

   return {
      context,
      browse: (random = () => 0) => browseLinkedin(context as never, BASE, random),
   }
}

const site = () =>
   setup(
      { [`${BASE}/in/me/`]: OWN },
      {
         [`${BASE}/feed/`]: feedHtml,
         [POST_1]: postHtml('/in/grace-hopper/'),
         [POST_2]: postHtml('https://www.linkedin.com/company/acme/'),
      }
   )

describe('postLinks', () => {
   it('should find each post of the feed once, as a full address of the site, without its query', () => {
      expect(postLinks(feedHtml, BASE)).toEqual([POST_1, POST_2])
   })

   it('should ignore links to other sites', () => {
      expect(postLinks('<a href="https://evil.example/feed/update/urn:li:activity:1/">x</a>', BASE)).toEqual([])
   })
})

describe('authorLink', () => {
   it('should take the first member or company link that is not the own profile', () => {
      expect(authorLink(postHtml('/in/grace-hopper/'), BASE, OWN)).toBe(`${BASE}/in/grace-hopper/`)
      expect(authorLink(postHtml('/company/acme/'), BASE, OWN)).toBe(`${BASE}/company/acme/`)
   })

   it('should answer undefined when the post links to nobody else', () => {
      expect(authorLink('<a href="/in/ada-lovelace/">Me</a>', BASE, OWN)).toBeUndefined()
   })
})

describe('browseLinkedin', () => {
   it('should read the feed, the own profile, then one post and its author', async () => {
      const { context, browse } = site()

      await expect(browse()).resolves.toBe('DONE')

      expect(context.visit.mock.calls.map(([url]) => url)).toEqual([
         `${BASE}/feed/`,
         `${BASE}/in/me/`,
         POST_1,
         `${BASE}/in/grace-hopper/`,
      ])
      expect(context.browser.scrollBy).toHaveBeenCalled()
   })

   it('should open two posts and their authors on another day', async () => {
      const { context, browse } = site()

      await browse(() => 0.999999)

      expect(context.visit.mock.calls.map(([url]) => url)).toEqual([
         `${BASE}/feed/`,
         `${BASE}/in/me/`,
         POST_2,
         `${BASE}/company/acme/`,
         POST_1,
         `${BASE}/in/grace-hopper/`,
      ])
   })

   it('should stop with SIGNED_OUT when the feed asks for a sign-in', async () => {
      const { context, browse } = setup({ [`${BASE}/feed/`]: `${BASE}/login` })

      await expect(browse()).resolves.toBe('SIGNED_OUT')
      expect(context.visit).toHaveBeenCalledTimes(1)
   })

   it('should stop with SIGNED_OUT when a later page asks for a sign-in', async () => {
      const { browse } = setup(
         { [`${BASE}/in/me/`]: `${BASE}/checkpoint/challenge/x` },
         { [`${BASE}/feed/`]: feedHtml }
      )

      await expect(browse()).resolves.toBe('SIGNED_OUT')
   })

   it('should go on with the next post when one may not be opened, and say why', async () => {
      const { context, browse } = site()
      const open = context.visit.getMockImplementation()

      context.visit.mockImplementation(async (url: string) => {
         if (url === POST_2) {
            throw new VisitError('robots', 'robots.txt does not allow this page.')
         }

         return open ? open(url) : url
      })

      await expect(browse(() => 0.999999)).resolves.toBe('DONE')

      expect(context.warn).toHaveBeenCalledWith('robots.txt does not allow this page.')
      expect(context.visit).toHaveBeenLastCalledWith(`${BASE}/in/grace-hopper/`)
   })

   it('should still be done when the feed shows no post', async () => {
      const { context, browse } = setup({ [`${BASE}/in/me/`]: OWN })

      await expect(browse()).resolves.toBe('DONE')
      expect(context.log).toHaveBeenCalledWith('The feed showed no post to open')
   })
})
