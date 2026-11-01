import { describe, expect, it } from 'vitest'

import {
   type BlockType,
   type Graph,
   type NodeConfig,
   blockOf,
   errorsOf,
   estimateGraph,
   previewGraph,
   validateGraph,
} from './workflow'

const LINK_BLOCKS: BlockType[] = [
   'collect.profilesFromLinks',
   'collect.companiesFromLinks',
   'collect.postsFromLinks',
   'collect.employeesFromLinks',
   'collect.emailsFromLinks',
   'collect.commentersFromLinks',
   'collect.reactorsFromLinks',
   'collect.profileCommentsFromLinks',
   'collect.profileReactionsFromLinks',
   'collect.adsFromLinks',
]

const alone = (type: BlockType, config: NodeConfig = {}): Graph => ({
   nodes: [
      {
         id: 'start',
         type: 'trigger.manual',
         config: {},
         position: {
            x: 0,
            y: 0,
         },
      },
      {
         id: 'collect',
         type,
         config,
         position: {
            x: 0,
            y: 100,
         },
      },
   ],
   edges: [
      {
         from: 'start',
         to: 'collect',
      },
   ],
})

const LINKS = ['https://www.linkedin.com/in/ada', 'https://www.linkedin.com/in/grace']

const costOf = (type: BlockType, config: NodeConfig) =>
   estimateGraph(alone(type, config), {
      posts: 0,
      profiles: 0,
      companies: 0,
   }).nodes.collect

describe('blocks that work from pasted links', () => {
   it.each(LINK_BLOCKS)('should refuse %s with no link', type => {
      expect(errorsOf(validateGraph(alone(type))).map(({ message }) => message)).toEqual([
         expect.stringContaining('paste at least one link'),
      ])
      expect(errorsOf(validateGraph(alone(type, { links: LINKS })))).toEqual([])
   })

   it.each(LINK_BLOCKS)('should start %s with a "how many" of 10, when it has one', type => {
      expect(blockOf(type).config.parse({}).howMany ?? 10).toBe(10)
   })

   it('should price each link of each block at what the data service charges', () => {
      expect(costOf('collect.profilesFromLinks', { links: LINKS }).costMicros).toBe(2 * 4_000)
      expect(costOf('collect.companiesFromLinks', { links: LINKS }).costMicros).toBe(2 * 4_000)
      expect(costOf('collect.emailsFromLinks', { links: LINKS }).costMicros).toBe(2 * 20_000)
      expect(costOf('collect.commentersFromLinks', { links: LINKS }).costMicros).toBe(2 * 10 * 2_000)
      expect(costOf('collect.adsFromLinks', { links: LINKS }).costMicros).toBe(2 * 10 * 2_000)
   })

   it('should price people at companies with the fee of each page of 25', () => {
      expect(
         costOf('collect.employeesFromLinks', {
            links: LINKS,
            howMany: 30,
         })
      ).toEqual({
         items: 60,
         costMicros: 2 * (30 * 4_000 + 2 * 100_000),
      })
   })

   it('should read only the first link in a preview', () => {
      const [, preview] = previewGraph(alone('collect.profilesFromLinks', { links: LINKS })).nodes

      expect(preview?.config.links).toEqual(LINKS.slice(0, 1))
   })
})

describe('blocks that search', () => {
   it('should ask a company search for something to search by', () => {
      expect(errorsOf(validateGraph(alone('collect.searchCompanies')))).toHaveLength(1)
      expect(errorsOf(validateGraph(alone('collect.searchCompanies', { query: 'fintech' })))).toEqual([])
      expect(errorsOf(validateGraph(alone('collect.searchCompanies', { companySize: ['11-50'] })))).toEqual([])
   })

   it('should ask a job search for a job title', () => {
      expect(errorsOf(validateGraph(alone('collect.searchJobs')))).toHaveLength(1)
      expect(errorsOf(validateGraph(alone('collect.searchJobs', { jobTitles: 'product manager' })))).toEqual([])
   })

   it('should price a company search by company and a job search by job', () => {
      expect(costOf('collect.searchCompanies', { query: 'x' })).toEqual({
         items: 10,
         costMicros: 10 * 4_000,
      })
      expect(
         costOf('collect.searchJobs', {
            jobTitles: 'x',
            howMany: 50,
         })
      ).toEqual({
         items: 50,
         costMicros: 50 * 1_000,
      })
   })

   it('should price a people search with the fee of each page of 25', () => {
      expect(costOf('collect.searchPeople', { howMany: 10 }).costMicros).toBe(25 * 4_000 + 100_000)
      expect(costOf('collect.searchPeople', { howMany: 26 }).costMicros).toBe(2 * (25 * 4_000 + 100_000))
   })

   it('should take every filter of a people search', () => {
      const keys = blockOf('collect.searchPeople').fields.map(({ key }) => key)

      expect(keys).toEqual(
         expect.arrayContaining([
            'yearsAtCompany',
            'pastCompanies',
            'pastTitles',
            'schools',
            'names',
            'companyHQLocations',
            'profileLanguages',
            'keep',
         ])
      )
   })
})

describe('keeping what a block finds', () => {
   it('should leave a block saved before it with it off and start a new block with it on', () => {
      expect(blockOf('collect.searchPeople').config.parse({}).keep).toBe(false)
      expect(blockOf('collect.searchCompanies').config.parse({}).keep).toBe(true)
   })

   it('should offer the check box on every block that finds people, companies or posts, not on ads', () => {
      expect(blockOf('collect.adsFromLinks').fields.some(({ key }) => key === 'keep')).toBe(false)
      expect(blockOf('collect.findPosts').fields.some(({ key }) => key === 'keep')).toBe(true)
      expect(blockOf('collect.domainLookup').fields.some(({ key }) => key === 'keep')).toBe(true)
   })
})
