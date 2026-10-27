import { HTMLElement, parse } from 'node-html-parser'

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
type Project = AccountProfile['projects']['items'][number]
type Language = AccountProfile['languages']['items'][number]
type Recommendation = AccountProfile['recommendations']['received']['items'][number]

const TEXT_BOX = '[data-testid="expandable-text-box"]'
// Marks that wrap a link's text while the text is put together, so a space can be added around it.
const LINK_START = '\u0001'
const LINK_END = '\u0002'

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

// A text with its line breaks, without the "…more" button the page puts inside it. A mention, a hashtag or a company is a link between
// empty elements and the page draws the space around it in its style, so a space is added where a word meets a link.
const bodyOf = (box: HTMLElement | null | undefined) => {
   if (!box) {
      return undefined
   }

   const copy = parse(box.outerHTML)

   copy.querySelectorAll('[data-testid="expandable-text-button"]').forEach(button => button.remove())
   copy.querySelectorAll('a').forEach(link => link.replaceWith(`${LINK_START}${link.textContent}${LINK_END}`))

   return some(
      copy.structuredText
         .split('\n')
         .map(line => line.trim())
         .join('\n')
         .replace(new RegExp(`([^\\s(])${LINK_START}`, 'g'), '$1 ')
         .replace(new RegExp(`${LINK_END}(?=[\\p{L}\\p{N}])`, 'gu'), ' ')
         .replace(new RegExp(`[${LINK_START}${LINK_END}]`, 'g'), '')
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

// The paragraphs that follow a block, grouped by how many levels above it they sit: the paragraphs beside the block, then those beside
// its parent, and so on up to the card.
const paragraphsAbove = (block: HTMLElement, card: HTMLElement) => {
   const levels: HTMLElement[][] = []

   for (let node: HTMLElement | null = block; node && node !== card; node = node.parentNode) {
      const found: HTMLElement[] = []

      for (let next = node.nextElementSibling; next; next = next.nextElementSibling) {
         if (next.tagName === 'P') {
            found.push(next)
         }
      }

      if (found.length > 0) {
         levels.push(found)
      }
   }

   return levels
}

// Some accounts get the main page with no `data-view-name` at all (staging, 2026-10-27, an account whose card says "Verify in 2
// minutes": a run ended "could not be opened" on it). There the cards are found by what every layout has: the `componentkey` of the
// photo, the addresses of the links (contact info, summary edit, analytics, connections) and the order of the paragraphs. Each reader
// looks for the first layout's marker and falls back to these, so what was read before does not change.
const PHOTO = 'a[componentkey="topcard-logo-image-referencekey"]'
const CONTACT_LINK = 'a[href*="/overlay/contact-info/"]'

// The top card is the nearest block around the profile photo that holds the name and the contact link (the page's first heading is a
// count of notices, so the name is not found by being the first `h2`).
const topCardOf = (root: HTMLElement) => {
   const marked = root.querySelector('[data-view-name="profile-top-card"]')

   if (marked) {
      return marked
   }

   for (let node = root.querySelector(PHOTO)?.parentNode; node; node = node.parentNode) {
      if (node.querySelector('h2') && node.querySelector(CONTACT_LINK)) {
         return node
      }
   }

   return undefined
}

// The top of the profile: name, the verified mark, pronouns, headline, place, the pictures and the connections. The name sits in a
// block marked as the verified badge (a picture with a role inside it when the member is verified); a page with no marks has the block
// around the name instead. The pronouns, when there are any, are a paragraph nearer to that block than the headline, which is followed
// by the line of current places, before the block that ends with the "Contact info" link; how deep the name sits differs between
// profiles, so the paragraphs are told apart by their nearness.
export const parseTopCard = (html: string): TopCard | undefined => {
   const card = topCardOf(parse(html))
   const heading = card?.querySelector('h2')
   const name = textOf(heading)

   if (!card || !name) {
      return undefined
   }

   const badge = card.querySelector('[data-view-name="profile-top-card-verified-badge"]') ?? heading?.parentNode
   const [first, second] = badge ? paragraphsAbove(badge, card) : []
   const pronouns = second ? textOf(first?.[0]) : undefined
   const headline = textOf((second ?? first)?.[0])
   const contact = card.querySelector(CONTACT_LINK)
   const place = contact?.closest('div')?.querySelector('p')
   const photoLink = card.querySelector(`[data-view-name="profile-top-card-member-photo"], ${PHOTO}`)

   return {
      name,
      verified: badge?.querySelector('[role="img"]') != null,
      pronouns: some(pronouns),
      headline: some(headline),
      location: place && !place.querySelector('a') ? some(textOf(place)) : undefined,
      imageUrl: pictureOf(photoLink?.querySelector('img')),
      coverUrl: pictureOf(
         card.querySelectorAll('img').find(image => image.getAttribute('src')?.includes('background'))
      ),
      connections: some(
         /^(\d[\d.,]*\+?)/.exec(
            textOf(
               card.querySelector(
                  '[data-view-name="profile-top-card-view-all-connections"], a[href*="/mynetwork/invite-connect/connections/"]'
               )
            )
         )?.[1]
      ),
      profileUrl: addressOf(photoLink?.getAttribute('href')),
   }
}

// The skills named under the About text: a block of two paragraphs (a label, then the skills joined by bullets) beside the link that
// shows them all, which is found by its own name so the label may be in any language.
export const parseTopSkills = (html: string): string[] => {
   const block = parse(html).querySelector(
      'a[data-view-name="form-about-top-skills-view-details"]'
   )?.previousElementSibling

   return (block ? (linesOf(block)[1] ?? '') : '').split('•').map(clean).filter(Boolean).slice(0, 10)
}

// The text of the about card, without its "more" button. A page with no marks has the card around the link that edits it (the nearest
// block with a text and a single heading, so the text of a post further down is never taken).
const aboutBoxOf = (root: HTMLElement) => {
   const marked = root.querySelector('[data-view-name="profile-card-about"] [data-testid="expandable-text-box"]')

   if (marked) {
      return marked
   }

   for (let node = root.querySelector('a[href*="/edit/forms/summary/"]')?.parentNode; node; node = node.parentNode) {
      if (node.querySelectorAll('h2').length > 1) {
         return undefined
      }

      const box = node.querySelector(TEXT_BOX)

      if (box) {
         return box
      }
   }

   return undefined
}

export const parseAbout = (html: string) => bodyOf(aboutBoxOf(parse(html)))

// The three numbers LinkedIn shows only to the account: each is a link marked by its own name (or, on a page with no marks, by its
// address), and each appears twice in the page.
export const parseAnalytics = (html: string): AccountProfile['analytics'] => {
   const root = parse(html)
   const link = (name: string, path: string) =>
      root.querySelector(`[data-view-name="insights-${name}"], a[href*="/analytics/${path}"]`)
   const impressions = link('content-impressions', 'creator/content/')
   const profileViews = leadingCount(textOf(link('wvmp', 'profile-views/')))
   const postImpressions = leadingCount(textOf(impressions))
   const searchAppearances = leadingCount(textOf(link('search-appearances', 'search-appearances/')))

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

// The skills a job or a project names, as the link to them reads ("Roadmapping, Research and +1 skill"): the ones it spells out.
const skillsOf = (item: HTMLElement) =>
   textOf(item.querySelector('a[href*="skill-associations"]'))
      .replace(/\s+\S+\s+\+\d+\s.*$/, '')
      .split(', ')
      .map(clean)
      .filter(Boolean)

const jobOf = (item: HTMLElement): Experience | undefined => {
   // The header (title, company, dates, place) is the text of the link to the job's edit form; after it come the text, a note from
   // LinkedIn and the skills, which must not be taken for the place.
   const header = item.querySelector('a[href*="/details/experience/edit/forms/"]')
   const lines = linesOf(
      header ?? item,
      paragraph =>
         paragraph.querySelector(TEXT_BOX) != null || paragraph.closest('a[href*="skill-associations"]') != null
   )
   const [title, place, when, where] = lines

   if (!title) {
      return undefined
   }

   const [company, employmentType] = parts(place)
   const [dates, duration] = parts(when)
   const [location, workMode] = parts(where)
   const companyLink = item.querySelector('a[href*="/company/"]')

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
      description: bodyOf(item.querySelector(TEXT_BOX)),
      skills: skillsOf(item),
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

const entityOf = (link: HTMLElement, kind: keyof Interests): ProfileEntity | undefined => {
   // The paragraphs of the card itself, not those of a link inside it (a newsletter links to who publishes it).
   const [named, ...others] = link.querySelectorAll('p').filter(paragraph => paragraph.closest('a') === link)
   // "TeamXP, Company" is the accessible name, then the name itself, in two spans of the first paragraph.
   const spans = named?.querySelectorAll('span') ?? []
   const name = textOf(spans.at(-1)) || textOf(named)

   if (!name) {
      return undefined
   }

   // After the name: a member's degree ("· 2nd"), then the headline, and last how many follow; a page has only the followers. A
   // newsletter has a description and then how often it is published, which is all it says about its readers.
   const lines = others.map(textOf).filter(Boolean)
   const degree = lines[0]?.startsWith('·') ? lines.shift() : undefined
   const last = lines.pop()

   return {
      name,
      subtitle: some(kind === 'newsletters' ? last : lines[0]),
      degree: some(degree?.replace(/^·\s*/, '')),
      imageUrl: pictureOf(link.querySelector('img')),
      url: addressOf(link.getAttribute('href')),
      followers: kind === 'newsletters' ? undefined : some(last),
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
      const entity = kind && link.parentNode?.closest('a') == null ? entityOf(link, kind) : undefined

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
   const marked = root.querySelectorAll('[data-view-name^="profile-card-pymk-recommendation"] a[href*="/in/"]')
   const people =
      marked.length > 0
         ? marked
         : root
              .querySelectorAll('a[href*="/in/"]')
              .filter(link => link.querySelector('figure') != null && /^·\s*\d/.test(linesOf(link)[1] ?? ''))
   const peopleYouMayKnow = people.flatMap(link => {
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
   const cards = root.querySelectorAll('[data-view-name="company-recommendation-card-impression"]')
   const pageLinks = (parent: HTMLElement) => parent.querySelectorAll('a[href*="/company/"], a[href*="/showcase/"]')
   // With no marks a page is one link holding the picture, the name, what it is and how many follow it; a company named in the
   // Interests card has no line for what it is, so it is not taken.
   const pages =
      cards.length > 0
         ? cards.map(card => ({
              card,
              link: pageLinks(card)[0],
           }))
         : pageLinks(root)
              .filter(link => link.querySelector('figure') != null && /^\d/.test(linesOf(link)[2] ?? ''))
              .map(link => ({
                 card: link,
                 link,
              }))
   const youMightLike = pages.flatMap(({ card, link }) => {
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

const elementsOf = (parent: HTMLElement) =>
   parent.childNodes.filter((node): node is HTMLElement => node instanceof HTMLElement)

// The line after a name that tells how the account is related to the author ("• You", "• 2nd").
const isDegree = (line: string | undefined) => line !== undefined && /^[•·]/.test(line)

// The row of buttons under a post is the block with the Comment and the Repost button as its own children; the reaction button and the
// one that opens the reactions are nested deeper, so the four are, in the order of the page: reaction, reactions menu, comment, repost.
const countsOf = (item: HTMLElement) => {
   const bar = item
      .querySelectorAll('div')
      .find(div => elementsOf(div).filter(child => child.tagName === 'BUTTON').length >= 2)
   const buttons = bar?.querySelectorAll('button') ?? []

   return {
      reactions: leadingCount(textOf(buttons[0])),
      comments: leadingCount(textOf(buttons[2])),
      reposts: leadingCount(textOf(buttons[3])),
   }
}

// How many times an own post was seen is the line before the link to its analytics.
const impressionsOf = (item: HTMLElement) =>
   leadingCount(
      textOf(item.querySelector('a[href*="/analytics/post-summary/"]')?.parentNode?.parentNode?.querySelector('p'))
   )

// A post of the activity page. Above its text, in order: a row for who reposted it (their name in bold, inside the line), then a row
// for who wrote it, whose lines are the name, the degree ("• You"), the headline and the age; a company has no degree and no headline.
// A post with no text is read for its author only, because without the text there is no telling where the header ends.
const postOf = (item: HTMLElement): Post | undefined => {
   const box = item.querySelector(TEXT_BOX)
   const text = box?.closest('p') ?? undefined
   const container = text?.parentNode
   const above = container && text ? container.childNodes.slice(0, container.childNodes.indexOf(text)) : []
   const rows = above.filter((node): node is HTMLElement => node instanceof HTMLElement)
   const paragraphs = text
      ? rows.flatMap(row => (row.tagName === 'P' ? [row] : row.querySelectorAll('p')))
      : item.querySelectorAll('p')
   const reposted = paragraphs[0]?.querySelector('a[href*="/in/"] strong') != null
   const lines = paragraphs.map(textOf).filter(Boolean)

   if (reposted) {
      lines.shift()
   }

   const [author, ...rest] = lines

   if (!author) {
      return undefined
   }

   if (isDegree(rest[0])) {
      rest.shift()
   }

   const when = text ? (rest.pop() ?? '') : ''

   return {
      kind: reposted ? 'REPOST' : 'POST',
      author,
      authorHeadline: text ? some(rest[0]) : undefined,
      authorImageUrl: pictureOf(rows.flatMap(row => row.querySelectorAll('img')).at(-1)),
      when,
      text: (bodyOf(box) ?? '').slice(0, 3000),
      imageUrl: pictureOf(text?.nextElementSibling?.querySelector('a > figure > img')),
      ...countsOf(item),
      impressions: impressionsOf(item),
   }
}

// The posts of the activity page: each is a list item of the list marked `ProfileRecentActivity...`; a post of the account or one it
// reposted (written by someone else, a person or a company), up to the limit.
export const parsePosts = (html: string, limit: number): Post[] =>
   parse(html)
      .querySelectorAll(ACTIVITY_ITEM)
      .map(postOf)
      .filter((post): post is Post => post !== undefined)
      .slice(0, limit)

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

// The line that follows a company's logo in a project: the picture is in a figure, and the line is a paragraph in the block next to it.
const lineAfterLogo = (item: HTMLElement) => {
   const next = (item.querySelector('figure') ?? item.querySelector('img'))?.nextElementSibling

   return next?.tagName === 'P' ? next : next?.querySelector('p')
}

// The projects page: each project is a block with a link to its edit form that holds the name and the dates in two paragraphs; the
// same link at the end of the block has no text and the Add button leads to another address. The text and the skills follow the link,
// and the company a project belongs to is a logo followed by one line, which is kept as the page writes it (in its language).
export const parseProjects = (html: string): Project[] =>
   parse(html)
      .querySelectorAll('a[href*="/details/projects/edit/forms/"]')
      .filter(link => link.querySelector('p') != null)
      .flatMap(link => {
         const [name, dates] = linesOf(link)
         const item = link.parentNode
         const company = item ? lineAfterLogo(item) : undefined

         return name && item
            ? [
                 {
                    name,
                    dates: some(dates),
                    description: bodyOf(item.querySelectorAll(TEXT_BOX).find(box => box.closest('a') == null)),
                    skills: skillsOf(item),
                    associatedWith: company?.tagName === 'P' ? some(textOf(company)) : undefined,
                 },
              ]
            : []
      })

// The languages page: a row holds the language and its level as two paragraphs, and, next to them, the link to its edit form.
export const parseLanguages = (html: string): Language[] =>
   parse(html)
      .querySelectorAll('a[href*="/details/languages/edit/forms/"]')
      .filter(link => !link.getAttribute('href')?.endsWith('/new/'))
      .flatMap(link => {
         const row = link.parentNode?.parentNode
         const [name, proficiency] = row ? linesOf(row) : []

         return name
            ? [
                 {
                    name,
                    proficiency: some(proficiency),
                 },
              ]
            : []
      })

// A card of the recommendations page (received or given) is a link with the picture, then the lines: the name, the degree, the headline
// and how the two know each other. The text is in the nearest block around the card that has one; a card without a text must not take
// the text of the next card, so a block that holds more than one card is not it.
export const parseRecommendations = (html: string): Recommendation[] => {
   const isCard = (link: HTMLElement) => link.querySelector('figure') != null
   const cardsIn = (block: HTMLElement) => block.querySelectorAll('a[href*="/in/"]').filter(isCard)

   return cardsIn(parse(html).querySelector('[data-testid="lazy-column"]') ?? parse('')).flatMap(card => {
      const [name, ...lines] = linesOf(card)
      let block: HTMLElement | null = card.parentNode

      while (block && block.querySelector(TEXT_BOX) == null) {
         block = block.parentNode
      }

      const degree = isDegree(lines[0]) ? lines.shift() : undefined
      const own = block && cardsIn(block).length === 1 ? bodyOf(block.querySelector(TEXT_BOX)) : undefined

      return name
         ? [
              {
                 name,
                 degree: some(degree?.replace(/^[•·]\s*/, '')),
                 headline: some(lines[0]),
                 imageUrl: pictureOf(card.querySelector('img')),
                 url: addressOf(card.getAttribute('href')),
                 relationship: some(lines[1]),
                 text: (own ?? '').slice(0, 20_000),
              },
           ]
         : []
   })
}

// The contact info overlay: a row per kind, each an icon and a block of two paragraphs, the label and the value. The offer of the paid
// plan below the rows has no icon. The icons are not told apart (the recording keeps none), so an email is found by its mailto link and
// a phone by its digits; every other row is kept with its label as the page writes it. The link to the profile itself is skipped.
export const parseContact = (html: string): AccountProfile['contact'] => {
   const column = parse(html).querySelector('[data-testid="dialog"] [data-testid="lazy-column"]')
   const emails: string[] = []
   const phones: NonNullable<AccountProfile['contact']>['phones'] = []
   const other: NonNullable<AccountProfile['contact']>['other'] = []

   for (const row of column?.children ?? []) {
      const info = row.children.find(child => child.tagName === 'DIV')
      const [label, ...values] = info?.children.filter(child => child.tagName === 'P').map(textOf) ?? []
      const link = info?.querySelector('a[href]')
      const href = link?.getAttribute('href') ?? ''

      if (row.children.every(child => child.tagName !== 'SVG') || !label || values.length === 0) {
         continue
      }

      const text = values.join(' ')
      const type = some(/\(([^)]{1,40})\)/.exec(text)?.[1]?.trim())
      const value = clean(text.replace(/\([^)]*\)/, ''))

      if (href.startsWith('mailto:')) {
         const [address] = href.slice('mailto:'.length).split('?')

         if (address) emails.push(address)
      } else if (new URL(href, 'https://www.linkedin.com').pathname.startsWith('/in/') && addressOf(href)) {
         continue
      } else if (value && /^\+?[\d\s().-]{6,}$/.test(value) && value.replace(/\D/g, '').length >= 6) {
         phones.push({
            value,
            type,
         })
      } else if (value) {
         other.push({
            label,
            value,
            type,
         })
      }
   }

   return emails.length + phones.length + other.length > 0
      ? {
           emails: emails.slice(0, 10),
           phones: phones.slice(0, 10),
           other: other.slice(0, 20),
        }
      : undefined
}

// The services card of the profile page lists them one per paragraph; its "Show all" link has none.
export const parseServices = (html: string): string[] => {
   const card = parse(html).querySelector('[data-view-name="profile-card-services"]')

   return card ? linesOf(card).slice(0, 50) : []
}

// The box the account sees at the top of its own page when it is open to work: the first line says for whom, in bold, the second what
// for. It is found by its edit button, which the offers to hire and to volunteer beside it do not have.
export const parseOpenToWork = (html: string): AccountProfile['openToWork'] => {
   const box = parse(html).querySelector('[data-view-name="profile-edit-open-to"]')?.closest('li')
   const line = textOf(box?.querySelector('strong'))

   if (!box || !line) {
      return undefined
   }

   return {
      audience: parts(line)[1] ?? line,
      titles: (linesOf(box)[1] ?? '').split(', ').map(clean).filter(Boolean),
   }
}
