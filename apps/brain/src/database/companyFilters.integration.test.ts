import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { companySnapshotFrom } from 'core'

import { CompanyViewService } from './companyView.service'
import { ConflictError } from './conflict'
import { type LinkedInCompanyListQuery, LinkedInCompanyService } from './linkedInCompany.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'

// Needs PostgreSQL. Two read companies (the shapes of real reads) and one never read.

const email = `${randomUUID()}@elitale.com`
let userId: string

const NOVA = {
   companyName: 'Nova Technologies, Inc.',
   tagline: 'Service oriented voice/data company',
   industry: 'Telecommunications',
   industryCategory: 'Telecommunications',
   employeeCountRange: '11\u201350',
   employeeCount: 19,
   followers: 2952,
   foundedYear: 2002,
   verified: false,
   activeStatus: true,
   pageType: 'COMPANY',
   jobsUrl: 'https://www.linkedin.com/jobs/search?f_C=1458481',
   website: 'http://www.nova-tech.us',
   hqCity: 'Plymouth',
   hqState: 'Minnesota',
   hqCountry: 'United States',
   locations: [
      {
         city: 'Plymouth',
         state: 'Minnesota',
         country: 'United States',
      },
   ],
   specialities: ['Unified Communication', 'Voice/Data Cabling'],
   employeesByFunction: [
      {
         function: 'Sales',
         count: 7,
      },
      {
         function: 'Engineering',
         count: 2,
      },
   ],
   employeesBySkill: [
      {
         skill: 'SIP Trunking',
         count: 4,
      },
   ],
}

const DU_TOIT = {
   companyName: 'Du Toit Yacht Design',
   description: 'More custom catamaran metres than any other yacht designer.',
   industry: 'Maritime',
   industryCategory: 'Maritime',
   employeeCountRange: '2-10',
   employeeCount: 12,
   followers: 2014,
   foundedYear: 2001,
   jobsUrl: 'https://www.linkedin.com/jobs/search?f_C=35591296',
   hqCity: 'Montague Gardens',
   hqState: 'Western Cape',
   hqCountry: 'South Africa',
   specialities: ['Boat systems'],
   employeesByFunction: [
      {
         function: 'Arts and Design',
         count: 6,
      },
      {
         function: 'Sales',
         count: 1,
      },
   ],
   employeesBySchool: [
      {
         school: 'University of Cape Town',
         count: 1,
      },
   ],
}

const read = async (slug: string, row: Record<string, unknown>) => {
   const snapshot = companySnapshotFrom(row)

   await PrismaService.client.pageSnapshot.create({
      data: {
         userId,
         kind: 'COMPANY',
         slug,
         data: snapshot,
      },
   })
   await LinkedInCompanyService.applyRead(userId, slug, snapshot)
}

const slugsOf = async (filters: Omit<LinkedInCompanyListQuery, 'page' | 'pageSize'>) =>
   (
      await LinkedInCompanyService.list(userId, {
         ...filters,
         page: 1,
         pageSize: 50,
      })
   ).items
      .map(({ slug }) => slug)
      .sort()

describe('Companies drawer filters (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await LinkedInCompanyService.addMany(
         userId,
         ['nova', 'du-toit', 'unread'].map(slug => ({
            slug,
            url: `https://www.linkedin.com/company/${slug}`,
         }))
      )
      await read('nova', NOVA)
      await read('du-toit', DU_TOIT)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should filter on the read: team, years, bands, places, words, pages and freshness', async () => {
      expect(
         await slugsOf({
            team: [
               {
                  kind: 'department',
                  values: ['sales'],
                  min: 5,
               },
            ],
         })
      ).toEqual(['nova'])
      expect(await slugsOf({ founded: { min: 2002 } })).toEqual(['nova'])
      expect(await slugsOf({ sizes: ['11-50'] })).toEqual(['nova'])
      expect(await slugsOf({ places: ['Western Cape'] })).toEqual(['du-toit'])
      expect(await slugsOf({ offices: ['plymouth'] })).toEqual(['nova'])
      expect(await slugsOf({ specialities: ['boat systems'] })).toEqual(['du-toit'])
      expect(
         await slugsOf({
            words: {
               values: ['catamaran'],
               match: 'any',
            },
         })
      ).toEqual(['du-toit'])
      expect(
         await slugsOf({
            team: [
               {
                  kind: 'school',
                  values: ['University of Cape Town'],
                  min: 1,
               },
            ],
         })
      ).toEqual(['du-toit'])
      expect(await slugsOf({ hasJobs: true })).toEqual(['du-toit', 'nova'])
      expect(await slugsOf({ active: true })).toEqual(['nova'])
      expect(await slugsOf({ followers: { max: 2500 } })).toEqual(['du-toit'])
      expect(await slugsOf({ read: 'never' })).toEqual(['unread'])
      expect(await slugsOf({ read: 'last7' })).toEqual(['du-toit', 'nova'])
      expect(await slugsOf({ visited: 'never' })).toEqual(['du-toit', 'nova', 'unread'])
      // Characters that mean something to ILIKE are matched as written.
      expect(
         await slugsOf({
            words: {
               values: ['%'],
               match: 'any',
            },
         })
      ).toEqual([])
   })

   it('should match every company rule of an ICP and show unread companies only when asked', async () => {
      const icp = {
         industries: ['maritime'],
         companySizes: ['2 - 10'],
         locations: ['South Africa'],
         problemKeywords: [],
      }

      expect(
         await slugsOf({
            icp: {
               rules: icp,
               includeUnread: false,
            },
         })
      ).toEqual(['du-toit'])
      expect(
         await slugsOf({
            icp: {
               rules: icp,
               includeUnread: true,
            },
         })
      ).toEqual(['du-toit', 'unread'])
      expect(
         await LinkedInCompanyService.count(userId, {
            icp: {
               rules: {
                  ...icp,
                  locations: ['United States'],
               },
               includeUnread: false,
            },
         })
      ).toBe(0)
   })

   it('should offer the values found in the reads with how many companies hold each', async () => {
      const facets = await LinkedInCompanyService.drawerFacets(userId)

      expect(facets.department).toEqual(
         expect.arrayContaining([
            {
               value: 'Sales',
               count: 2,
            },
         ])
      )
      expect(facets.place.map(({ value }) => value)).toEqual(
         expect.arrayContaining(['Plymouth', 'Minnesota', 'Western Cape'])
      )
      expect(facets.size.map(({ value }) => value).sort()).toEqual(['11\u201350', '2-10'])
   })

   it('should save a view once per name and delete only the owner\u2019s', async () => {
      await CompanyViewService.save(userId, 'EU MSPs', 'industry=Telecommunications')
      await CompanyViewService.save(userId, 'EU MSPs', 'industry=Maritime')

      const [view] = await CompanyViewService.list(userId)

      expect(view).toMatchObject({
         name: 'EU MSPs',
         query: 'industry=Maritime',
      })
      await expect(CompanyViewService.remove(randomUUID(), view?.id ?? '')).rejects.toBeInstanceOf(ConflictError)
      await CompanyViewService.remove(userId, view?.id ?? '')
      expect(await CompanyViewService.list(userId)).toEqual([])
   })
})
