import { type TaskContext, VisitError } from '../defineTask'
import { SELECTORS, kindOf } from '../linkedinLogin/accountValidator'
import { between } from '../linkedinLogin/browseAfterLogin'

type Context = Pick<TaskContext, 'browser' | 'visit' | 'pause' | 'log' | 'warn'>

const POST = /href="((?:https:\/\/www\.linkedin\.com)?\/feed\/update\/urn:li:(?:activity|share|ugcPost):\d+\/?)/g
const PROFILE = /href="((?:https:\/\/www\.linkedin\.com)?\/(?:in|company)\/[\w%-]+\/?)/g

// Links of the page that stay on the site, as full addresses without a query, each once.
const linksOf = (html: string, pattern: RegExp, baseUrl: string) => {
   const { origin } = new URL(baseUrl)
   const found = [...html.matchAll(pattern)].map(([, href]) => new URL(href ?? '', origin))

   return [...new Set(found.filter(url => url.origin === origin).map(({ origin: at, pathname }) => `${at}${pathname}`))]
}

export const postLinks = (html: string, baseUrl: string) => linksOf(html, POST, baseUrl)

// The page header links to the own profile first, so the first other member or company is whoever posted.
export const authorLink = (html: string, baseUrl: string, ownProfile: string) =>
   linksOf(html, PROFILE, baseUrl).find(url => url !== ownProfile && !url.endsWith('/in/me/'))

const pick = <T>(items: T[], count: number, random: () => number) => {
   const left = [...items]
   const picked: T[] = []

   while (picked.length < count && left.length > 0) {
      picked.push(...left.splice(Math.floor(random() * left.length), 1))
   }

   return picked
}

export type BrowseOutcome = 'DONE' | 'SIGNED_OUT'

// A daily look around the account, as its owner would: down the feed, their own profile, then one or two posts and who
// posted them. It only reads; nothing is liked, followed, sent or kept from those pages.
export const browseLinkedin = async (
   { browser, visit, pause, log, warn }: Context,
   baseUrl: string,
   random: () => number = Math.random
): Promise<BrowseOutcome> => {
   const readDown = async (min: number, max: number) => {
      for (let count = between(min, max, random); count > 0; count -= 1) {
         await browser.scrollBy(between(400, 900, random))
         await pause(between(1000, 3500, random))
      }
   }
   const open = async (url: string) => {
      const landed = await visit(url)

      return ['login', 'checkpoint'].includes(kindOf(landed)) ? undefined : landed
   }

   const feed = await open(`${baseUrl}/feed/`)

   if (!feed) {
      return 'SIGNED_OUT'
   }

   if (kindOf(feed) === 'consent' && (await browser.exists(SELECTORS.consentAccept, 1500))) {
      await browser.click(SELECTORS.consentAccept)
      log('Accepted the ads consent page')
   }

   await readDown(4, 8)
   const posts = pick(postLinks(await browser.pageHtml(), baseUrl), between(1, 2, random), random)

   // LinkedIn sends /in/me/ to the profile of whoever is signed in.
   const own = await open(`${baseUrl}/in/me/`)

   if (!own) {
      return 'SIGNED_OUT'
   }

   log('Opened the own profile')
   await readDown(2, 5)
   await pause(between(10_000, 20_000, random))

   if (posts.length === 0) {
      log('The feed showed no post to open')
   }

   for (const post of posts) {
      try {
         if (!(await open(post))) {
            return 'SIGNED_OUT'
         }

         await readDown(1, 3)
         await pause(between(5000, 15_000, random))
         const author = authorLink(await browser.pageHtml(), baseUrl, own)

         if (!author) {
            log('The post links to no author')
            continue
         }

         if (!(await open(author))) {
            return 'SIGNED_OUT'
         }

         log('Opened the profile of who posted')
         await readDown(1, 3)
         await pause(between(8000, 15_000, random))
      } catch (error) {
         warn(error instanceof VisitError ? error.message : 'A post could not be read')
      }
   }

   return 'DONE'
}
