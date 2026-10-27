import { describe, expect, it, vi } from 'vitest'

import { accountProfileSchema } from '@automatedLinkedIn/contracts'

import {
   aboutMarkup,
   activityMarkup,
   commentsPage,
   contactPage,
   educationPage,
   experienceMarkup,
   insightsMarkup,
   interestsPage,
   languagesPage,
   openToWorkMarkup,
   pagesYouMightLikeMarkup,
   peopleYouMayKnowMarkup,
   postsPage,
   profilePage,
   projectsPage,
   recommendationsPage,
   servicesMarkup,
   skillsPage,
   topCardMarkup,
   topSkillsMarkup,
} from '../../linkedin/profileFixture'
import { VisitError } from '../defineTask'
import { DETAIL_PAGES } from './detailPages'
import { BUDGET_MS, readProfile } from './read'

const BASE = 'https://www.linkedin.com'
const ME = `${BASE}/in/sample-person/`

const main = profilePage(
   topCardMarkup({
      name: 'Sample Person',
      headline: 'Product lead at Sampleworks',
      location: 'Sampletown, Exampleland',
      connections: '106',
   }),
   openToWorkMarkup('Recruiters only', 'Product Lead, Head of Product roles'),
   aboutMarkup('A short about.'),
   topSkillsMarkup(['Roadmapping', 'Discovery']),
   servicesMarkup(['Roadmapping', 'Discovery']),
   insightsMarkup('8 profile views', '0 post impressions', '3 search appearances'),
   activityMarkup('164 followers'),
   experienceMarkup([
      {
         title: 'Product lead',
         company: 'Sampleworks',
         dates: '2021 - Present',
      },
   ]),
   peopleYouMayKnow(),
   pagesYouMightLikeMarkup([
      {
         name: 'Sample News',
         what: 'Newspaper',
         followers: '1,000 followers',
         slug: 'sample-news',
      },
   ])
)

function peopleYouMayKnow() {
   return peopleYouMayKnowMarkup([
      {
         name: 'Riley Sample',
         degree: '3rd',
         headline: 'Designer',
         slug: 'riley-sample',
      },
   ])
}

const companies = interestsPage(
   ['Companies', 'Groups'],
   [
      {
         name: 'Sample Co',
         followers: '174 followers',
      },
   ]
)
const groups = interestsPage(
   ['Companies', 'Groups'],
   [
      {
         name: 'Reading Club',
         kind: 'group',
         followers: '2,100 members',
      },
   ]
)

const PAGES: Record<string, string> = {
   [ME]: main,
   [`${ME}details/experience/`]: profilePage(
      experienceMarkup([
         {
            title: 'Product lead',
            company: 'Sampleworks',
            dates: '2021 - Present',
            skills: 'Roadmapping and +1 skill',
         },
         {
            title: 'Analyst',
            company: 'Demo Co',
            dates: '2018 - 2021',
         },
      ])
   ),
   [`${ME}details/education/`]: educationPage([
      {
         school: 'Example University',
         degree: 'BSc',
         dates: '2012 – 2016',
      },
   ]),
   [`${ME}details/skills/`]: skillsPage([{ name: 'Sales' }, { name: 'Research' }]),
   [`${ME}details/projects/`]: projectsPage([
      {
         name: 'Sample app',
         dates: '2022 – 2023',
         skills: 'Roadmapping and +1 skill',
         associated: 'Associated with Sampleworks',
      },
   ]),
   [`${ME}details/recommendations/`]: recommendationsPage([
      {
         name: 'Riley Sample',
         slug: 'riley-sample',
         headline: 'Designer',
         text: 'A good colleague.',
      },
   ]),
   [`${ME}details/recommendations/?detailScreenTabIndex=1`]: recommendationsPage([
      {
         name: 'Taylor Demo',
         slug: 'taylor-demo',
         text: 'Worked well with me.',
      },
   ]),
   [`${ME}details/languages/`]: languagesPage([
      {
         name: 'English',
         level: 'Native',
      },
   ]),
   [`${ME}details/interests/`]: companies,
   [`${ME}overlay/contact-info/`]: contactPage([
      {
         label: 'Email',
         value: '<p><a href="mailto:sample.person@example.com">sample.person@example.com</a></p>',
      },
      {
         label: 'Phone',
         value: '<p>(Mobile)<span>+91 75973 65803</span><span></span></p>',
      },
   ]),
   [`${ME}recent-activity/all/`]: postsPage('All', [
      {
         text: 'A post',
         age: '1mo',
      },
   ]),
   [`${ME}recent-activity/comments/`]: commentsPage([
      {
         post: 'Their post',
         comment: 'congrats',
         age: '2yr',
      },
   ]),
}

type Page = {
   // Where `/in/me/` leads.
   lands?: string
   // The pages (by address) that will not open.
   refuse?: string[]
   // Milliseconds each pause adds to the clock.
   pauseMs?: number
   // The pages, by address, when they are not the ones above.
   pages?: Record<string, string>
   // Pages that show only their title for their first reads, then their content.
   late?: string[]
}

const TITLE_ONLY = '<html><body><section aria-label="Primary content"><p>Recommendations</p></section></body></html>'

const setup = ({ lands = ME, refuse = [], pauseMs, pages = PAGES, late = [] }: Page = {}) => {
   const attached: Record<string, string> = {}
   const opened: string[] = []
   const reads: Record<string, number> = {}
   let current = BASE
   let chip = 0
   let time = 0
   const browser = {
      inspect: vi.fn(async () => ({ url: current })),
      clickLink: vi.fn(async () => undefined),
      back: vi.fn(async () => current),
      scrollBy: vi.fn(async () => false),
      // The Interests page shows the second chip's items after one click on its label.
      pageHtml: vi.fn(async () => {
         reads[current] = (reads[current] ?? 0) + 1

         if (late.includes(current) && (reads[current] ?? 0) <= 2) {
            return TITLE_ONLY
         }

         return current.endsWith('details/interests/') && chip === 1 ? groups : (pages[current] ?? '<html></html>')
      }),
      clickNth: vi.fn(async (selector: string, nth: number, _avoid: string) => {
         if (selector !== '[role="radio"]' || !current.endsWith('details/interests/') || nth > 1) {
            return false
         }

         chip = nth

         return true
      }),
      screenshot: vi.fn(async () => Buffer.from('png')),
      clearCookies: vi.fn(async () => undefined),
      exists: vi.fn(async () => false),
      click: vi.fn(async () => current),
   }
   const context = {
      browser,
      visit: vi.fn(async (url: string) => {
         opened.push(url)

         if (refuse.includes(url)) {
            throw new VisitError('load', 'The page did not open.')
         }

         current = url === `${BASE}/in/me/` ? lands : url
         chip = 0

         return current
      }),
      pause: vi.fn(async (ms: number) => {
         time += pauseMs ?? ms
      }),
      log: vi.fn(),
      warn: vi.fn(),
      attach: vi.fn((name: string, content: string) => {
         attached[name] = content
      }),
      screenshot: vi.fn(async () => undefined),
   }

   return {
      browser,
      context,
      opened,
      attached,
      file: () => JSON.parse(attached['profile.json'] ?? 'null') as ReturnType<typeof accountProfileSchema.parse>,
      read: (snapshots = false) =>
         readProfile(
            context as never,
            BASE,
            { snapshots },
            {
               random: () => 0.5,
               now: () => time,
            }
         ),
   }
}

describe('readProfile', () => {
   it('should read the profile and the pages behind it into one file that fits the contract', async () => {
      const { read, file, attached } = setup()

      await expect(read()).resolves.toMatchObject({
         outcome: 'DONE',
         dropped: 0,
      })

      const profile = file()

      expect(accountProfileSchema.safeParse(profile).success).toBe(true)
      expect(profile).toMatchObject({
         name: 'Sample Person',
         headline: 'Product lead at Sampleworks',
         location: 'Sampletown, Exampleland',
         connections: '106',
         followers: 164,
         about: 'A short about.',
         profileUrl: ME,
      })
      expect(profile.analytics).toMatchObject({
         profileViews: 8,
         postImpressions: 0,
         searchAppearances: 3,
      })
      // The experience page replaces the card of the profile page, which shows only the first jobs.
      expect(profile.experience.map(({ title }) => title)).toEqual(['Product lead', 'Analyst'])
      expect(profile.education[0]).toMatchObject({ school: 'Example University' })
      expect(profile.skills).toEqual({
         items: [{ name: 'Sales' }, { name: 'Research' }],
         total: 2,
      })
      expect(profile.activity?.posts[0]).toMatchObject({ text: 'A post' })
      expect(profile.activity?.comments[0]).toMatchObject({
         author: 'Sample Person',
         text: 'congrats',
      })
      expect(profile.peopleYouMayKnow[0]).toMatchObject({ name: 'Riley Sample' })
      expect(profile.youMightLike[0]).toMatchObject({ name: 'Sample News' })
      expect(Object.keys(attached)).toEqual(['profile.json'])
   })

   it('should read the items of every chip of Interests, sorted by what they are', async () => {
      const { read, file } = setup()

      await read()

      expect(file().interests.companies.map(({ name }) => name)).toEqual(['Sample Co'])
      expect(file().interests.groups.map(({ name }) => name)).toEqual(['Reading Club'])
   })

   it('should leave out what the pages of a bare account do not hold, and still call the read done', async () => {
      const { read, file } = setup({ pages: { [ME]: main } })

      await expect(read()).resolves.toMatchObject({
         outcome: 'DONE',
         dropped: 0,
      })

      expect(file().recommendations).toEqual({
         received: {
            items: [],
            total: 0,
         },
         given: {
            items: [],
            total: 0,
         },
      })
      expect(file().projects.items).toEqual([])
      expect(file().languages.items).toEqual([])
      expect(file().topSkills).toEqual(['Roadmapping', 'Discovery'])
   })

   it('should read the projects, the recommendations received and given, the languages, the services and open to work', async () => {
      const { read, file } = setup()

      await read()

      expect(file().projects).toEqual({
         items: [
            {
               name: 'Sample app',
               dates: '2022 – 2023',
               skills: ['Roadmapping'],
               associatedWith: 'Associated with Sampleworks',
            },
         ],
         total: 1,
      })
      expect(file().recommendations.received.items.map(({ name }) => name)).toEqual(['Riley Sample'])
      expect(file().recommendations.given.items.map(({ name }) => name)).toEqual(['Taylor Demo'])
      expect(file().recommendations.received.items[0]?.text).toBe('A good colleague.')
      expect(file().languages.items).toEqual([
         {
            name: 'English',
            proficiency: 'Native',
         },
      ])
      expect(file().services).toEqual(['Roadmapping', 'Discovery'])
      expect(file().openToWork).toEqual({
         audience: 'Recruiters only',
         titles: ['Product Lead', 'Head of Product roles'],
      })
   })

   it('should read the contact info into the file, and keep it out of the log, the warnings and the report counts', async () => {
      const { read, file, context } = setup()
      const result = await read()
      const said = [...context.log.mock.calls, ...context.warn.mock.calls, JSON.stringify(result)].flat().join(' ')

      expect(file().contact).toEqual({
         emails: ['sample.person@example.com'],
         phones: [
            {
               value: '+91 75973 65803',
               type: 'Mobile',
            },
         ],
         other: [],
      })
      expect(said).not.toMatch(/example\.com|75973/)
   })

   it('should wait for a page that shows only its title at first to draw its content', async () => {
      const given = `${ME}details/recommendations/?detailScreenTabIndex=1`
      const { read, file } = setup({ late: [given] })

      await read()

      expect(file().recommendations.given.items.map(({ name }) => name)).toEqual(['Taylor Demo'])
   })

   it('should click only the chips of Interests, and open only the pages of the profile', async () => {
      const { read, browser, opened } = setup()

      await read()

      expect(browser.clickLink).not.toHaveBeenCalled()
      expect(browser.click).not.toHaveBeenCalled()
      expect(opened).toEqual([`${BASE}/in/me/`, ...DETAIL_PAGES.map(({ path }) => `${ME}${path}`)])
   })

   it('should say part was read, and still hand over the rest, when one page does not open', async () => {
      const { read, file, context } = setup({ refuse: [`${ME}details/education/`] })

      await expect(read()).resolves.toMatchObject({ outcome: 'PARTIAL' })

      expect(file().education).toEqual([])
      expect(file().skills.items).toHaveLength(2)
      expect(context.warn).toHaveBeenCalledWith('The page did not open.')
   })

   it('should open the pages under the profile’s own address, read from the page, when LinkedIn leaves /in/me/ as it is', async () => {
      const { read, opened } = setup({
         lands: `${BASE}/in/me/`,
         pages: {
            ...PAGES,
            [`${BASE}/in/me/`]: main,
         },
      })

      await expect(read()).resolves.toMatchObject({ outcome: 'DONE' })

      expect(opened).toEqual([`${BASE}/in/me/`, ...DETAIL_PAGES.map(({ path }) => `${ME}${path}`)])
   })

   it('should say the profile did not open, and hand over nothing, when the address leads to another page', async () => {
      const { read, attached, opened } = setup({ lands: `${BASE}/feed/` })

      await expect(read()).resolves.toEqual({
         outcome: 'NOT_OPENED',
         counts: [],
         dropped: 0,
      })

      expect(attached).toEqual({})
      expect(opened).toEqual([`${BASE}/in/me/`])
   })

   it('should say the page held no profile when the address is a profile but the page has no top card', async () => {
      const { read, attached } = setup({ pages: { [ME]: '<html><body>nothing</body></html>' } })

      await expect(read()).resolves.toMatchObject({ outcome: 'NOT_OPENED' })

      expect(attached).toEqual({})
   })

   it('should say signed out when LinkedIn asks for a sign-in', async () => {
      const { read, attached } = setup({ lands: `${BASE}/login` })

      await expect(read()).resolves.toMatchObject({ outcome: 'SIGNED_OUT' })

      expect(attached).toEqual({})
   })

   it('should begin no new page when its time is up, and keep what it read', async () => {
      const { read, opened, file } = setup({ pauseMs: 3 * 60_000 })
      const result = await read()

      expect(BUDGET_MS).toBe(8 * 60 * 1000)
      expect(result.outcome).toBe('PARTIAL')
      expect(opened.length).toBeLessThan(7)
      expect(file().name).toBe('Sample Person')
   })

   it('should leave out a section that does not fit the contract, and keep the rest', async () => {
      const long = 'x'.repeat(400)
      const { read, file } = setup({
         pages: {
            ...PAGES,
            [`${ME}details/education/`]: educationPage([{ school: long }]),
         },
      })

      await expect(read()).resolves.toMatchObject({
         outcome: 'PARTIAL',
         dropped: 1,
      })

      expect(file().education).toEqual([])
      expect(file().experience).toHaveLength(2)
   })

   it('should never put a name or a word of the profile in the log, a warning or the report counts', async () => {
      const { read, context } = setup({ refuse: [`${ME}details/skills/`] })
      const result = await read()
      const said = [...context.log.mock.calls, ...context.warn.mock.calls, JSON.stringify(result)].flat().join(' ')

      expect(said).not.toMatch(/Sample|Riley|Product|Sampleworks|congrats/)
   })

   it('should keep the pages with the run when asked to, the profile with its links and the others by their markup only', async () => {
      const { read, attached } = setup()

      await read(true)

      expect(Object.keys(attached)).toEqual(
         expect.arrayContaining(['profile.html', 'profile.inspect.json', 'detail-experience.html', 'profile.json'])
      )
      expect(attached).not.toHaveProperty(['detail-experience.inspect.json'])
      expect(Object.keys(attached).length).toBeLessThanOrEqual(20)
   })
})
