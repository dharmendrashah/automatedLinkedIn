import { describe, expect, it } from 'vitest'

import { person } from 'core'

import { MINDCASE_API_KEY } from 'env'

import { DataClient } from './dataClient'
import {
   commentersFrom,
   commentersParams,
   companiesFromDomains,
   domainParams,
   employeesFrom,
   employeesParams,
   engagedParams,
   findPostsParams,
   hiringFrom,
   jobsParams,
   postsFrom,
   postsOfParams,
   reactorsFrom,
   reactorsParams,
   searchPeopleParams,
   searchedPeopleFrom,
} from './operations'

// Opt-in, spends real money (about $0.15): DATA_LIVE_TEST=1 with MINDCASE_API_KEY. Checks that every new operation's
// answer maps to items. Not picked up by the unit or integration runners.

const company = {
   kind: 'company' as const,
   slug: 'microsoft',
   url: 'https://www.linkedin.com/company/microsoft',
   name: 'Microsoft',
   hiring: [],
}
const PERSON = 'https://www.linkedin.com/in/williamhgates'
const LIVE_MS = 300_000

describe.skipIf(!process.env.DATA_LIVE_TEST)('data operations (live data service)', () => {
   const client = new DataClient({
      key: MINDCASE_API_KEY,
      requestsPerMinute: 45,
   })
   let spent = 0

   const collect = async (slug: string, params: Parameters<DataClient['collect']>[1]) => {
      const outcome = await client.collect(slug, params, {
         jobId: null,
         onJobId: async () => undefined,
      })

      spent += outcome.costMicros
      console.log(slug, outcome.status, outcome.rows.length, 'rows', outcome.costMicros, 'micros', 'total', spent)
      console.log(slug, 'keys', Object.keys(outcome.rows[0] ?? {}).join(','))

      return outcome.rows
   }

   it(
      'should find posts by keyword and the posts of a person',
      async () => {
         const found = await collect(
            'posts',
            findPostsParams({
               keywords: 'sales pipeline',
               postedWithin: 'month',
               howMany: 3,
            })
         )
         const ofPerson = await collect('posts', postsOfParams(PERSON, { howMany: 3 }))

         expect(postsFrom(found).length).toBeGreaterThan(0)
         expect(postsFrom(ofPerson).length).toBeGreaterThan(0)
      },
      LIVE_MS
   )

   it(
      'should read what a person engaged with',
      async () => {
         const gates = person({
            slug: 'williamhgates',
            url: PERSON,
         })
         const comments = await collect('profile-comments', engagedParams(gates, { howMany: 3 }))
         const reactions = await collect('profile-reactions', engagedParams(gates, { howMany: 3 }))

         expect(postsFrom([...comments, ...reactions]).length).toBeGreaterThan(0)
      },
      LIVE_MS
   )

   it(
      'should find employees',
      async () => {
         const staff = await collect(
            'company-employees',
            employeesParams(company, {
               howMany: 5,
               titles: ['sales'],
               seniority: [],
            })
         )

         expect(employeesFrom(staff, company).length).toBeGreaterThan(0)
      },
      LIVE_MS
   )

   it(
      'should find hiring companies and companies from a website',
      async () => {
         const jobs = await collect(
            'jobs',
            jobsParams([company], {
               jobTitle: 'Sales',
               howMany: 5,
            })
         )
         const domains = await collect('domain-lookup', domainParams(['stripe.com'], 1))

         expect(hiringFrom(jobs, [company]).get('microsoft')?.length).toBeGreaterThan(0)
         expect(companiesFromDomains(domains)).toEqual([expect.objectContaining({ slug: 'stripe' })])
      },
      LIVE_MS
   )

   it(
      'should accept the richer settings and search people',
      async () => {
         const found = postsFrom(
            await collect(
               'posts',
               findPostsParams({
                  keywords: 'sales pipeline',
                  postedWithin: 'week',
                  howMany: 1,
                  sortBy: 'date',
                  contentType: 'all',
                  includeReposts: false,
               })
            )
         )
         const [post] = found

         expect(post).toBeDefined()

         if (!post) {
            return
         }

         const comments = await collect(
            'post-comments',
            commentersParams(post, {
               limit: 3,
               postedWithin: 'month',
               includeReplies: true,
            })
         )
         const reactions = await collect(
            'post-reactions',
            reactorsParams(post, {
               limit: 3,
               reactionType: 'LIKE',
            })
         )
         const people = await collect(
            'profiles',
            searchPeopleParams({
               keywords: 'sales',
               titles: ['head of sales'],
               companies: [],
               locations: ['London'],
               seniority: ['220'],
               functions: ['25'],
               headcount: ['51-200'],
               yearsOfExperience: [],
               changedJobs: false,
               postedRecently: false,
               howMany: 2,
            })
         )

         expect(commentersFrom(comments, post).length + reactorsFrom(reactions, post).length).toBeGreaterThan(0)
         expect(searchedPeopleFrom(people).length).toBeGreaterThan(0)
      },
      LIVE_MS
   )
})
