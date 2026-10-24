import { describe, expect, it } from 'vitest'

import {
   aboutMarkup,
   activityMarkup,
   commentsPage,
   educationPage,
   experienceMarkup,
   insightsMarkup,
   interestsPage,
   pagesYouMightLikeMarkup,
   peopleYouMayKnowMarkup,
   postsPage,
   profilePage,
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
   parsePosts,
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
