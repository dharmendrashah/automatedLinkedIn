import { describe, expect, it } from 'vitest'

import {
   aboutMarkup,
   activityMarkup,
   commentsPage,
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
} from './profileFixture'
import {
   parseAbout,
   parseAnalytics,
   parseComments,
   parseEducation,
   parseExperience,
   parseFollowers,
   parseInterests,
   parseLanguages,
   parseOpenToWork,
   parsePosts,
   parseProjects,
   parseRecommendations,
   parseServices,
   parseSkills,
   parseSuggestions,
   parseTopCard,
} from './profileReader'

describe('parseTopCard', () => {
   const card = {
      name: 'Sample Person',
      pronouns: 'They/Them',
      headline: 'Product lead at Sampleworks',
      places: 'Sampleworks · Example University',
      location: 'Sampletown, Exampleland',
      connections: '106',
   }

   it('should read the name, pronouns, headline, place, pictures, connections and the address of the profile', () => {
      expect(parseTopCard(profilePage(topCardMarkup(card)))).toEqual({
         name: 'Sample Person',
         verified: false,
         pronouns: 'They/Them',
         headline: 'Product lead at Sampleworks',
         location: 'Sampletown, Exampleland',
         connections: '106',
         imageUrl: 'https://media.licdn.com/dms/image/v2/sample/profile-displayphoto-shrink_100_100/x',
         coverUrl: 'https://media.licdn.com/dms/image/v2/sample/profile-displaybackgroundimage-shrink_350_1400/x',
         profileUrl: 'https://www.linkedin.com/in/sample-person/',
      })
   })

   it('should say verified by the picture inside the name block, in any language', () => {
      expect(
         parseTopCard(
            profilePage(
               topCardMarkup({
                  ...card,
                  verified: true,
               })
            )
         )?.verified
      ).toBe(true)
   })

   it('should leave out what the card does not show: pronouns, and the cap of 500 or more connections as the page writes it', () => {
      const bare = parseTopCard(
         profilePage(
            topCardMarkup({
               ...card,
               pronouns: undefined,
               connections: '500+',
            })
         )
      )

      expect(bare?.pronouns).toBeUndefined()
      expect(bare?.connections).toBe('500+')
      expect(bare?.headline).toBe('Product lead at Sampleworks')
   })

   it('should give nothing for a page that has no top card', () => {
      expect(parseTopCard(profilePage('<p>nothing</p>'))).toBeUndefined()
   })
})

describe('parseAbout', () => {
   it('should give the text without the more button, keeping its lines', () => {
      expect(parseAbout(profilePage(aboutMarkup('First line.<br><br>Second line.')))).toBe('First line.\nSecond line.')
   })

   it('should give nothing when there is no about card', () => {
      expect(parseAbout(profilePage('<p>x</p>'))).toBeUndefined()
   })
})

describe('parseAnalytics and parseFollowers', () => {
   it('should read the three numbers the account alone sees, whatever the thousands mark, and the period', () => {
      expect(
         parseAnalytics(
            profilePage(insightsMarkup('8 profile views', '1,234 post impressions', '3 search appearances'))
         )
      ).toEqual({
         profileViews: 8,
         postImpressions: 1234,
         searchAppearances: 3,
         period: 'Past 7 days',
      })
      expect(
         parseAnalytics(profilePage(insightsMarkup('1.234 Profilaufrufe', '0 Impressionen', '12 Suchanfragen')))
      ).toMatchObject({
         profileViews: 1234,
         postImpressions: 0,
         searchAppearances: 12,
      })
   })

   it('should give nothing when one of the three is missing', () => {
      expect(parseAnalytics(profilePage('<p>x</p>'))).toBeUndefined()
   })

   it('should read the number of followers from the link to the followers page', () => {
      expect(parseFollowers(profilePage(activityMarkup('164 followers')))).toBe(164)
      expect(parseFollowers(profilePage('<p>x</p>'))).toBeUndefined()
   })
})

describe('parseExperience', () => {
   const jobs = [
      {
         title: 'Product lead',
         company: 'Sampleworks',
         type: 'Full-time',
         dates: 'Jul 2021 - Present',
         duration: '5 yrs 4 mos',
         location: 'Sampletown, Exampleland',
         mode: 'Hybrid',
         description: 'Runs discovery.',
         skills: 'Roadmapping, Research and +1 skill',
      },
      {
         title: 'Analyst',
         company: 'Demo Co',
         dates: '2018 - 2021',
      },
   ]

   it('should read each job: title, company and type, dates and duration, place and mode, text and skills', () => {
      const [first, second] = parseExperience(profilePage(experienceMarkup(jobs)))

      expect(first).toEqual({
         title: 'Product lead',
         company: 'Sampleworks',
         companyUrl: 'https://www.linkedin.com/company/100/',
         logoUrl: 'https://media.licdn.com/dms/image/v2/sample/company-logo_100_100/0',
         employmentType: 'Full-time',
         dates: 'Jul 2021 - Present',
         duration: '5 yrs 4 mos',
         location: 'Sampletown, Exampleland',
         workMode: 'Hybrid',
         description: 'Runs discovery.',
         skills: ['Roadmapping', 'Research'],
      })
      expect(second).toMatchObject({
         title: 'Analyst',
         company: 'Demo Co',
         dates: '2018 - 2021',
         skills: [],
      })
      expect(second?.location).toBeUndefined()
      expect(second?.employmentType).toBeUndefined()
   })

   it('should give nothing for a page without jobs', () => {
      expect(parseExperience(profilePage('<p>x</p>'))).toEqual([])
   })
})

describe('parseEducation', () => {
   it('should read each school with its degree and years, and a school with only a name', () => {
      expect(
         parseEducation(
            educationPage([
               {
                  school: 'Example University',
                  degree: 'BSc, Computing',
                  dates: '2012 – 2016',
               },
               { school: 'Sample School' },
            ])
         )
      ).toEqual([
         {
            school: 'Example University',
            degree: 'BSc, Computing',
            dates: '2012 – 2016',
         },
         { school: 'Sample School' },
      ])
   })
})

describe('parseSkills', () => {
   it('should read each skill once, by its row and its edit link', () => {
      expect(
         parseSkills(
            skillsPage([
               {
                  name: 'Sales',
                  usedAt: 'Product lead at Sampleworks',
               },
               { name: 'Research' },
               { name: 'Sales' },
            ])
         )
      ).toEqual([{ name: 'Sales' }, { name: 'Research' }])
   })
})

describe('parseInterests', () => {
   it('should sort the items of a chip into the kinds by where each leads, not by the chip name', () => {
      const found = parseInterests(
         interestsPage(
            ['Unternehmen', 'Gruppen'],
            [
               {
                  name: 'Sample Co',
                  followers: '174 followers',
               },
               {
                  name: 'Reading Club',
                  kind: 'group',
                  followers: '2,100 members',
               },
               {
                  name: 'Ada Voice',
                  kind: 'person',
                  followers: '9,000 followers',
               },
            ]
         )
      )

      expect(found.companies).toEqual([
         {
            name: 'Sample Co',
            imageUrl: 'https://media.licdn.com/dms/image/v2/sample/logo/0',
            url: 'https://www.linkedin.com/company/sample-co/',
            followers: '174 followers',
         },
      ])
      expect(found.groups.map(({ name }) => name)).toEqual(['Reading Club'])
      expect(found.topVoices.map(({ name }) => name)).toEqual(['Ada Voice'])
      expect(found.schools).toEqual([])
      expect(found.newsletters).toEqual([])
   })

   it('should read a member with the degree, the headline and the followers each in its own place', () => {
      const found = parseInterests(
         interestsPage(
            ['Top Voices'],
            [
               {
                  name: 'Ada Voice',
                  kind: 'person',
                  followers: '954,792 followers',
                  degree: '2nd',
                  headline: 'Cofounder at Examples',
               },
            ]
         )
      )

      expect(found.topVoices).toEqual([
         {
            name: 'Ada Voice',
            subtitle: 'Cofounder at Examples',
            degree: '2nd',
            followers: '954,792 followers',
            imageUrl: 'https://media.licdn.com/dms/image/v2/sample/logo/0',
            url: 'https://www.linkedin.com/in/ada-voice/',
         },
      ])
   })
})

describe('parseSuggestions', () => {
   const html = profilePage(
      peopleYouMayKnowMarkup([
         {
            name: 'Riley Sample',
            degree: '3rd',
            headline: 'Designer at Examples',
            slug: 'riley-sample',
         },
         {
            name: 'Taylor Demo',
            degree: '2nd',
            headline: 'Engineer at Demo Co',
            slug: 'taylor-demo',
         },
      ]),
      pagesYouMightLikeMarkup([
         {
            name: 'Sample News',
            what: 'Newspaper Publishing',
            followers: '826,303 followers',
            slug: 'sample-news',
            mutual: 'A friend follows this page',
         },
         {
            name: 'Demo Studio',
            what: 'Software',
            followers: '3,925 followers',
            slug: 'demo-studio',
            kind: 'showcase',
         },
      ])
   )

   it('should read the people you may know with their degree and headline, never the Connect button', () => {
      const { peopleYouMayKnow } = parseSuggestions(html)

      expect(peopleYouMayKnow).toEqual([
         {
            name: 'Riley Sample',
            subtitle: 'Designer at Examples',
            degree: '3rd',
            imageUrl: 'https://media.licdn.com/dms/image/v2/sample/profile-displayphoto-scale_100_100/riley-sample',
            url: 'https://www.linkedin.com/in/riley-sample/',
         },
         expect.objectContaining({
            name: 'Taylor Demo',
            degree: '2nd',
         }),
      ])
   })

   it('should read the pages you might like with what they are and how many follow them, not who of your connections does', () => {
      const { youMightLike } = parseSuggestions(html)

      expect(youMightLike[0]).toEqual({
         name: 'Sample News',
         subtitle: 'Newspaper Publishing',
         followers: '826,303 followers',
         imageUrl: 'https://media.licdn.com/dms/image/v2/sample/company-logo_100_100/sample-news',
         url: 'https://www.linkedin.com/company/sample-news/',
      })
      expect(youMightLike[1]?.url).toBe('https://www.linkedin.com/showcase/demo-studio/')
   })

   it('should give nothing for a page without the cards', () => {
      expect(parseSuggestions(profilePage('<p>x</p>'))).toEqual({
         peopleYouMayKnow: [],
         youMightLike: [],
      })
   })
})

describe('parsePosts and parseComments', () => {
   it('should read each post: who wrote it, their headline, its age and its text, up to the limit', () => {
      const html = postsPage('All', [
         {
            text: 'First post',
            age: '3yr',
         },
         {
            text: 'Second post',
            age: '1mo',
         },
      ])

      expect(parsePosts(html, 10)).toEqual([
         {
            kind: 'POST',
            author: 'Sample Person',
            authorHeadline: 'Founder at Sampleworks',
            authorImageUrl: 'https://media.licdn.com/dms/image/v2/sample/profile-displayphoto-shrink_100_100/me',
            when: '3yr',
            text: 'First post',
         },
         expect.objectContaining({ text: 'Second post' }),
      ])
      expect(parsePosts(html, 1)).toHaveLength(1)
   })

   it('should read the numbers of an own post: reactions, comments, reposts and impressions, and its picture', () => {
      const [post] = parsePosts(
         postsPage('All', [
            {
               text: 'With numbers',
               age: 'Jun 2',
               reactions: 4,
               comments: 1,
               impressions: 501,
               image: 'https://media.licdn.com/dms/image/v2/sample/feedshare/1',
            },
         ]),
         10
      )

      expect(post).toMatchObject({
         kind: 'POST',
         reactions: 4,
         comments: 1,
         impressions: 501,
         imageUrl: 'https://media.licdn.com/dms/image/v2/sample/feedshare/1',
      })
      expect(post?.reposts).toBeUndefined()
   })

   it('should read a repost as a repost by whoever wrote it, a person with a degree or a company with neither degree nor headline', () => {
      const posts = parsePosts(
         postsPage('All', [
            {
               text: 'A person’s post',
               age: 'Feb 21',
               author: 'Aneesh Naarang',
               degree: '\u2022 2nd',
               headline: 'Growth at Examples',
               repost: true,
            },
            {
               text: 'A company’s post',
               age: 'Dec 19, 2025',
               author: 'Elitale',
               degree: null,
               headline: null,
               repost: true,
               reposts: 5,
            },
         ]),
         10
      )

      expect(posts).toEqual([
         expect.objectContaining({
            kind: 'REPOST',
            author: 'Aneesh Naarang',
            authorHeadline: 'Growth at Examples',
            when: 'Feb 21',
            text: 'A person’s post',
         }),
         expect.objectContaining({
            kind: 'REPOST',
            author: 'Elitale',
            when: 'Dec 19, 2025',
            reposts: 5,
         }),
      ])
      expect(posts[1]?.authorHeadline).toBeUndefined()
      // The picture is the author's, not the account's who reposted it.
      expect(posts[0]?.authorImageUrl).toBe(
         'https://media.licdn.com/dms/image/v2/sample/profile-displayphoto-shrink_100_100/me'
      )
   })

   it('should keep the space around a mention or a hashtag, which the page draws with empty elements', () => {
      const [post] = parsePosts(
         postsPage('All', [
            {
               text: 'Using<span></span><span><a href="https://www.linkedin.com/company/x/"><strong>Acme</strong></a></span><span></span>for sending.<br><br><span><a href="https://www.linkedin.com/search/results/all/?keywords=%23mail"><strong>#Mail</strong></a></span>',
               age: '1mo',
            },
         ]),
         10
      )

      expect(post?.text).toBe('Using Acme for sending.\n#Mail')
   })

   it('should read the account’s own comment, with its age, as written by the account', () => {
      expect(
         parseComments(
            commentsPage([
               {
                  post: 'Someone else’s post',
                  comment: 'congrats',
                  age: '2yr',
               },
            ]),
            10,
            'Sample Person'
         )
      ).toEqual([
         {
            kind: 'POST',
            author: 'Sample Person',
            when: '2yr',
            text: 'congrats',
         },
      ])
   })

   it('should give nothing for a page with no activity', () => {
      expect(parsePosts(profilePage('<p>x</p>'), 10)).toEqual([])
      expect(parseComments(profilePage('<p>x</p>'), 10, 'Sample Person')).toEqual([])
   })
})

describe('parseProjects', () => {
   it('should read each project: name, dates, text, the skills it names, and the company it belongs to as the page writes it', () => {
      const [first, second] = parseProjects(
         projectsPage([
            {
               name: 'Sample app',
               dates: 'May 2022 – Present',
               description: 'Built the backend.',
               skills: 'API Development, npm and +7 skills',
               associated: 'Associated with Sampleworks',
            },
            { name: 'Small tool' },
         ])
      )

      expect(first).toEqual({
         name: 'Sample app',
         dates: 'May 2022 – Present',
         description: 'Built the backend.',
         skills: ['API Development', 'npm'],
         associatedWith: 'Associated with Sampleworks',
      })
      expect(second).toEqual({
         name: 'Small tool',
         skills: [],
      })
   })

   it('should give nothing for a page without projects, and never read the Add button as one', () => {
      expect(parseProjects(projectsPage([]))).toEqual([])
      expect(parseProjects(profilePage('<p>x</p>'))).toEqual([])
   })
})

describe('parseLanguages', () => {
   it('should read each language with its level, one row each', () => {
      expect(
         parseLanguages(
            languagesPage([
               {
                  name: 'English',
                  level: 'Professional working proficiency',
               },
               { name: 'Hindi' },
            ])
         )
      ).toEqual([
         {
            name: 'English',
            proficiency: 'Professional working proficiency',
         },
         { name: 'Hindi' },
      ])
   })

   it('should give nothing for a page without languages', () => {
      expect(parseLanguages(languagesPage([]))).toEqual([])
   })
})

describe('parseRecommendations', () => {
   const cards = [
      {
         name: 'Riley Sample',
         slug: 'riley-sample',
         headline: 'Founder at Examples',
         relationship: 'August 27, 2024, Riley was senior to Sample but did not manage them directly',
         text: 'Worked with Sample for three years.',
      },
      {
         name: 'Taylor Demo',
         slug: 'taylor-demo',
         degree: null,
         headline: 'Engineer at Demo Co',
         text: 'Great to work with.',
      },
   ]

   it('should read each card: who, the degree, the headline, how they know each other and the text', () => {
      const [first, second] = parseRecommendations(recommendationsPage(cards))

      expect(first).toEqual({
         name: 'Riley Sample',
         degree: '1st',
         headline: 'Founder at Examples',
         imageUrl: 'https://media.licdn.com/dms/image/v2/sample/profile-displayphoto-shrink_100_100/riley-sample',
         url: 'https://www.linkedin.com/in/riley-sample/',
         relationship: 'August 27, 2024, Riley was senior to Sample but did not manage them directly',
         text: 'Worked with Sample for three years.',
      })
      expect(second).toMatchObject({
         name: 'Taylor Demo',
         headline: 'Engineer at Demo Co',
         text: 'Great to work with.',
      })
      expect(second?.degree).toBeUndefined()
      expect(second?.relationship).toBeUndefined()
   })

   it('should not give a card the text of the next one when its own is missing', () => {
      const [first, second] = parseRecommendations(
         recommendationsPage([
            {
               ...cards[0],
               text: '',
            },
            cards[1],
         ] as typeof cards)
      )

      expect(first?.text).toBe('')
      expect(second?.text).toBe('Great to work with.')
   })

   it('should give nothing for a page without cards', () => {
      expect(parseRecommendations(recommendationsPage([]))).toEqual([])
   })
})

describe('parseServices and parseOpenToWork', () => {
   it('should read the services the card lists, not its Show all link', () => {
      expect(parseServices(profilePage(servicesMarkup(['Web Development', 'Information Security'])))).toEqual([
         'Web Development',
         'Information Security',
      ])
      expect(parseServices(profilePage('<p>x</p>'))).toEqual([])
   })

   it('should read for whom the account is open to work and the titles, from the box that has the edit button', () => {
      expect(
         parseOpenToWork(
            profilePage(openToWorkMarkup('Recruiters only', 'Technical Lead, Back End Developer and PHP roles'))
         )
      ).toEqual({
         audience: 'Recruiters only',
         titles: ['Technical Lead', 'Back End Developer and PHP roles'],
      })
   })

   it('should give nothing when the page has no open to work box', () => {
      expect(parseOpenToWork(profilePage('<p>x</p>'))).toBeUndefined()
   })
})
