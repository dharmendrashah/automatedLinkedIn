import { type HTMLElement, parse } from 'node-html-parser'

import { type AccountProfile, type ProfileEntity } from '@automatedLinkedIn/contracts'

// Everything here reads the markup of LinkedIn's profile pages as recorded on 2026-10-24 (two runs of the capture task) and nothing
// else: it holds no browser and no timing, so it is tested against pages made like the real ones (`profileFixture.ts`). The pages
// are LinkedIn's server-driven app: class names are generated, so the markers are `data-view-name`, `data-testid`, `componentkey`
// prefixes and address patterns, never a class and never a heading's words (the page comes in the account's language).

type Experience = AccountProfile['experience'][number]
type Education = AccountProfile['education'][number]
type Skill = AccountProfile['skills']['items'][number]
type Post = NonNullable<AccountProfile['activity']>['posts'][number]
type Interests = AccountProfile['interests']

// Between the two halves of a line such as "Company · Full-time" or "May 2017 - Present · 9 yrs 6 mos".
const SEPARATOR = ' · '
const MAX_ENTITIES = 50

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()
const textOf = (element: HTMLElement | null | undefined) => (element ? clean(element.textContent) : '')
const parts = (line: string | undefined) => (line ? line.split(SEPARATOR).map(clean) : [])
const some = (text: string | undefined) => (text ? text : undefined)

// A picture is only kept as an https address; one that is not (a data or blob address) is dropped.
const pictureOf = (element: HTMLElement | null | undefined) => {
   const src = element?.getAttribute('src')

   return src?.startsWith('https://') && src.length <= 1000 ? src : undefined
}

// An address on linkedin.com without its query, which for the account's own pages holds tracking and "self profile" marks.
const addressOf = (href: string | undefined, keepQuery = false) => {
   if (!href || !URL.canParse(href)) {
      return undefined
   }

   const url = new URL(href)

   if (url.protocol !== 'https:' || !(url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com'))) {
      return undefined
   }

   if (!keepQuery) {
      url.search = ''
   }

   url.hash = ''

   return url.toString().length <= 500 ? url.toString() : undefined
}

// The number a text starts with, as people write it in any language ("8 profile views", "1,234 followers", "3.925.517").
const leadingCount = (text: string) => {
   const digits = /^\s*(\d[\d.,\s\u00a0\u202f]*)/.exec(text)?.[1]?.replace(/\D/g, '')

   return digits ? Number(digits) : undefined
}

// A text with its line breaks, without the "…more" button the page puts inside it.
const bodyOf = (box: HTMLElement | null | undefined) => {
   if (!box) {
      return undefined
   }

   const copy = parse(box.outerHTML)

   copy.querySelectorAll('[data-testid="expandable-text-button"]').forEach(button => button.remove())

   return some(
      copy.structuredText
         .split('\n')
         .map(line => line.trim())
         .join('\n')
         .replace(/\n{3,}/g, '\n\n')
         .trim()
   )
}

// The lines of a block as the page writes them, each in its own paragraph.
const linesOf = (root: HTMLElement, skip: (paragraph: HTMLElement) => boolean = () => false) =>
   root
      .querySelectorAll('p')
      .filter(paragraph => !skip(paragraph))
      .map(textOf)
      .filter(Boolean)

export type TopCard = Pick<
   AccountProfile,
   'name' | 'verified' | 'pronouns' | 'headline' | 'location' | 'imageUrl' | 'coverUrl' | 'connections' | 'profileUrl'
>

// The top of the profile: name, the verified mark, pronouns, headline, place, the pictures and the connections. The name sits in a
// block marked as the verified badge (a picture with a role inside it when the member is verified), pronouns follow it, and the
// headline and the line of current places come after, before the block that ends with the "Contact info" link.
export const parseTopCard = (html: string): TopCard | undefined => {
   const card = parse(html).querySelector('[data-view-name="profile-top-card"]')
   const name = textOf(card?.querySelector('h2'))

   if (!card || !name) {
      return undefined
   }

   const badge = card.querySelector('[data-view-name="profile-top-card-verified-badge"]')
   const above = badge?.parentNode
   const block = above?.parentNode
   const pronouns = badge?.nextElementSibling?.tagName === 'P' ? textOf(badge.nextElementSibling) : undefined
   const direct = (block?.childNodes ?? []).filter(
      (node): node is HTMLElement => 'tagName' in node && (node as HTMLElement).tagName === 'P'
   )
   const contact = card.querySelector('a[href*="/overlay/contact-info/"]')
   const place = contact?.closest('div')?.querySelector('p')
   const photoLink = card.querySelector('[data-view-name="profile-top-card-member-photo"]')

   return {
      name,
      verified: badge?.querySelector('[role="img"]') != null,
      pronouns: some(pronouns),
      headline: some(textOf(direct[0])),
      location: place && !place.querySelector('a') ? some(textOf(place)) : undefined,
      imageUrl: pictureOf(photoLink?.querySelector('img')),
      coverUrl: pictureOf(
         card.querySelectorAll('img').find(image => image.getAttribute('src')?.includes('background'))
      ),
      connections: some(
         /^(\d[\d.,]*\+?)/.exec(
            textOf(card.querySelector('[data-view-name="profile-top-card-view-all-connections"]'))
         )?.[1]
      ),
      profileUrl: addressOf(photoLink?.getAttribute('href')),
   }
}

// The text of the about card, without its "more" button.
export const parseAbout = (html: string) =>
   bodyOf(parse(html).querySelector('[data-view-name="profile-card-about"] [data-testid="expandable-text-box"]'))

// The three numbers LinkedIn shows only to the account: each is a link marked by its own name, and each appears twice in the page.
export const parseAnalytics = (html: string): AccountProfile['analytics'] => {
   const root = parse(html)
   const link = (name: string) => root.querySelector(`[data-view-name="insights-${name}"]`)
   const impressions = link('content-impressions')
   const profileViews = leadingCount(textOf(link('wvmp')))
   const postImpressions = leadingCount(textOf(impressions))
   const searchAppearances = leadingCount(textOf(link('search-appearances')))

   if (profileViews === undefined || postImpressions === undefined || searchAppearances === undefined) {
      return undefined
   }

   // The period is the third line of the impressions link ("Past 7 days").
   const period = impressions
      ? (linesOf(impressions)[2] ?? parts(impressions.structuredText.split('\n')[2])[0])
      : undefined

   return {
      profileViews,
      postImpressions,
      searchAppearances,
      ...(period && { period }),
   }
}

// The number of followers, in the link to the followers' page that the activity card carries.
export const parseFollowers = (html: string) =>
   leadingCount(textOf(parse(html).querySelector('a[href$="/feed/followers/"]')))

const jobOf = (item: HTMLElement): Experience | undefined => {
   const lines = linesOf(
      item,
      paragraph =>
         paragraph.querySelector('[data-testid="expandable-text-box"]') != null ||
         paragraph.closest('a[href*="skill-associations"]') != null
   )
   const [title, place, when, where] = lines

   if (!title) {
      return undefined
   }

   const [company, employmentType] = parts(place)
   const [dates, duration] = parts(when)
   const [location, workMode] = parts(where)
   const companyLink = item.querySelector('a[href*="/company/"]')
   const skills = textOf(item.querySelector('a[href*="skill-associations"]'))
      .replace(/\s+\S+\s+\+\d+\s.*$/, '')
      .split(', ')
      .map(clean)
      .filter(Boolean)

   return {
      title,
      company: company ?? '',
      companyUrl: addressOf(companyLink?.getAttribute('href')),
      logoUrl: pictureOf(companyLink?.querySelector('img')),
      employmentType: some(employmentType),
      dates: some(dates),
      duration: some(duration),
      location: some(location),
      workMode: some(workMode),
      description: bodyOf(item.querySelector('[data-testid="expandable-text-box"]')),
      skills,
   }
}

// The jobs of the experience card or of its own page: each is an entity-collection item (one per company and role).
export const parseExperience = (html: string): Experience[] =>
   parse(html)
      .querySelectorAll('[componentkey^="entity-collection-item"]')
      .map(jobOf)
      .filter((job): job is Experience => job !== undefined)

// The schools of the education page: a row is the link to its edit form, with the school, the degree and the years as paragraphs.
export const parseEducation = (html: string): Education[] =>
   parse(html)
      .querySelectorAll('[data-testid^="profile_EducationDetailsSection"] a[href*="/details/education/edit/forms/"]')
      .flatMap(row => {
         const [school, degree, dates] = linesOf(row)

         return school
            ? [
                 {
                    school,
                    degree: some(degree),
                    dates: some(dates),
                 },
              ]
            : []
      })

// The skills page: each skill is a row with its edit link, the name in its first paragraph; the rows list where it was used.
export const parseSkills = (html: string): Skill[] => {
   const seen = new Set<string>()

   return parse(html)
      .querySelectorAll('[componentkey^="com.linkedin.sdui.profile.skill"]')
      .filter(row => row.querySelector('a[href*="/details/skills/edit/forms/"]') != null)
      .flatMap(row => {
         const name = textOf(row.querySelector('p'))

         if (!name || seen.has(name)) {
            return []
         }

         seen.add(name)

         return [{ name }]
      })
}

// What a member, company, group, newsletter or school link leads to, by its address (the chips are named in the page's language).
const kindOf = (href: string | undefined): keyof Interests | undefined => {
   const path = href && URL.canParse(href) ? new URL(href).pathname : ''

   if (path.startsWith('/in/')) return 'topVoices'
   if (path.startsWith('/company/') || path.startsWith('/showcase/')) return 'companies'
   if (path.startsWith('/groups/')) return 'groups'
   if (path.startsWith('/newsletters/') || path.startsWith('/pulse/')) return 'newsletters'
   if (path.startsWith('/school/')) return 'schools'

   return undefined
}

const entityOf = (link: HTMLElement): ProfileEntity | undefined => {
   const paragraphs = link.querySelectorAll('p')
   const [named, followers] = paragraphs
   // "TeamXP, Company" is the accessible name, then the name itself, in two spans of the first paragraph.
   const spans = named?.querySelectorAll('span') ?? []
   const name = textOf(spans.at(-1)) || textOf(named)

   if (!name) {
      return undefined
   }

   return {
      name,
      imageUrl: pictureOf(link.querySelector('img')),
      url: addressOf(link.getAttribute('href')),
      followers: some(textOf(followers)),
   }
}

// The items of the Interests page as it shows them (one chip at a time), sorted into the kinds by where each leads.
export const parseInterests = (html: string): Interests => {
   const found: Interests = {
      topVoices: [],
      companies: [],
      groups: [],
      newsletters: [],
      schools: [],
   }

   for (const link of parse(html).querySelectorAll('[data-testid="lazy-column"] a[href]')) {
      const kind = kindOf(link.getAttribute('href'))
      const entity = kind ? entityOf(link) : undefined

      if (kind && entity && found[kind].length < MAX_ENTITIES) {
         found[kind].push(entity)
      }
   }

   return found
}

// The cards of "People you may know" and "You might like" of the profile page: a person or a page, with its address and who it is.
// A person is one link holding the picture and three paragraphs (name, degree, headline); a page is a card of paragraphs (name,
// what it is, how many follow it, which of your connections do).
export const parseSuggestions = (html: string) => {
   const root = parse(html)
   const seen = new Set<string>()
   const peopleYouMayKnow = root
      .querySelectorAll('[data-view-name^="profile-card-pymk-recommendation"] a[href*="/in/"]')
      .flatMap(link => {
         const [name, degree, headline] = linesOf(link)
         const url = addressOf(link.getAttribute('href'))

         if (!name || !degree || !url || seen.has(url)) {
            return []
         }

         seen.add(url)

         return [
            {
               name,
               subtitle: some(headline),
               degree: some(degree.replace(/^·\s*/, '')),
               imageUrl: pictureOf(link.querySelector('img')),
               url,
            },
         ]
      })
   const youMightLike = root
      .querySelectorAll('[data-view-name="company-recommendation-card-impression"]')
      .flatMap(card => {
         const link = card.querySelector('a[href*="/company/"], a[href*="/showcase/"]')
         const [name, industry, followers] = linesOf(card)

         return name
            ? [
                 {
                    name,
                    subtitle: some(industry),
                    followers: some(followers),
                    imageUrl: pictureOf(link?.querySelector('img')),
                    url: addressOf(link?.getAttribute('href')),
                 },
              ]
            : []
      })

   return {
      peopleYouMayKnow: peopleYouMayKnow.slice(0, MAX_ENTITIES),
      youMightLike: youMightLike.slice(0, MAX_ENTITIES),
   }
}

const ACTIVITY_ITEM = '[data-testid^="ProfileRecentActivity"] [role="listitem"]'

// The posts of the activity page: each is a list item of the list marked `ProfileRecentActivity...`. Its paragraphs are the author,
// how the account is related to them ("• You"), their headline and the age, then the text.
export const parsePosts = (html: string, limit: number): Post[] =>
   parse(html)
      .querySelectorAll(ACTIVITY_ITEM)
      .slice(0, limit)
      .flatMap(item => {
         const author = textOf(item.querySelector('a[href*="/in/"] p span'))
         const lines = linesOf(
            item,
            paragraph => paragraph.querySelector('[data-testid="expandable-text-box"]') != null
         )

         return author
            ? [
                 {
                    kind: 'POST' as const,
                    author,
                    authorHeadline: some(lines[2]),
                    authorImageUrl: pictureOf(item.querySelector('figure img')),
                    when: lines[3] ?? '',
                    text: (bodyOf(item.querySelector('[data-testid="expandable-text-box"]')) ?? '').slice(0, 3000),
                 },
              ]
            : []
      })

// The comments page lists the posts the account commented on, each with the account's own comment as the last text of the item,
// the comment's age in the paragraph before it. The comment is shown as written by the account (`author`).
export const parseComments = (html: string, limit: number, author: string): Post[] =>
   parse(html)
      .querySelectorAll(ACTIVITY_ITEM)
      .slice(0, limit)
      .flatMap(item => {
         const boxes = item.querySelectorAll('[data-testid="expandable-text-box"]')
         const paragraphs = item.querySelectorAll('p')
         const at = paragraphs.findIndex(
            paragraph => paragraph.querySelector('[data-testid="expandable-text-box"]') === boxes.at(-1)
         )
         const text = bodyOf(boxes.at(-1))

         return boxes.length >= 2 && at > 0 && text
            ? [
                 {
                    kind: 'POST' as const,
                    author,
                    when: textOf(paragraphs[at - 1]),
                    text: text.slice(0, 3000),
                 },
              ]
            : []
      })
