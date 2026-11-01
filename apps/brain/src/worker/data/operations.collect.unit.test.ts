import { describe, expect, it, vi } from 'vitest'

import { person } from 'core'

import {
   adsFrom,
   adsParams,
   companiesFrom,
   companiesLinksParams,
   emailsFrom,
   emailsParams,
   jobPostingsFrom,
   jobPostingsParams,
   postsOfParams,
   searchCompaniesParams,
   searchPeopleParams,
} from './operations'

vi.mock('env', () => ({}))

const ACME = 'https://www.linkedin.com/company/acme'
const ADA = 'https://www.linkedin.com/in/ada'

describe('companies', () => {
   it('should send pasted links alone, with no row limit the data service would ignore', () => {
      expect(companiesLinksParams([ACME])).toEqual({ companies: [ACME] })
   })

   it('should always send a row limit with a search, and leave out filters that are empty', () => {
      expect(
         searchCompaniesParams({
            query: 'fintech',
            locations: [],
            companySize: ['11-50'],
            industries: [],
            howMany: 10,
         })
      ).toEqual({
         query: 'fintech',
         companySize: ['11-50'],
         maxResults: 10,
      })
   })

   it('should keep the company page it read, and drop a row with no company link', () => {
      const items = companiesFrom([
         {
            linkedinUrl: 'https://www.linkedin.com/company/acme/',
            companyName: 'Acme',
            industry: 'Software',
         },
         { companyName: 'No link' },
      ])

      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
         kind: 'company',
         slug: 'acme',
         name: 'Acme',
         preview: { industry: 'Software' },
      })
   })
})

describe('job postings', () => {
   it('should name each setting as the data service does and leave out what means any', () => {
      expect(
         jobPostingsParams({
            jobTitles: 'product manager',
            howMany: 10,
            locations: '',
            companies: ['Stripe'],
            workplaceType: ['remote'],
            employmentType: [],
            experienceLevel: [],
            salary: ['100k+'],
            postedWithin: 'any',
            sortBy: 'date',
            industries: ['4'],
            easyApply: true,
            fewApplicants: false,
         })
      ).toEqual({
         jobTitles: 'product manager',
         maxResults: 10,
         company: ['Stripe'],
         workplaceType: ['remote'],
         salary: ['100k+'],
         sortBy: 'date',
         industryIds: ['4'],
         easyApply: true,
      })
   })

   it('should read a posting with its company and salary, and drop one with no id or link', () => {
      expect(
         jobPostingsFrom([
            {
               jobId: '4001',
               jobUrl: 'https://www.linkedin.com/jobs/view/4001',
               jobTitle: 'Product manager',
               companyName: 'Jobsco',
               companyUrl: 'https://www.linkedin.com/company/jobsco',
               city: 'London',
               country: 'UK',
               salaryMin: 90000,
               salaryMax: 120000,
               salaryCurrency: 'GBP',
               salaryPeriod: 'year',
               applicants: 4,
            },
            { jobTitle: 'No id' },
         ])
      ).toEqual([
         {
            kind: 'job',
            slug: '4001',
            url: 'https://www.linkedin.com/jobs/view/4001',
            title: 'Product manager',
            company: 'Jobsco',
            companySlug: 'jobsco',
            location: 'London, UK',
            posted: null,
            workplace: null,
            employment: null,
            applicants: 4,
            salary: 'GBP 90000 to 120000 year',
         },
      ])
   })
})

describe('work emails and ads', () => {
   it('should ask for the profile links and read the email of each person by slug', () => {
      expect(
         emailsParams([
            person({
               slug: 'ada',
               url: ADA,
            }),
         ])
      ).toEqual({ urls: [ADA] })
      expect(
         emailsFrom([
            {
               profileUrl: 'https://www.linkedin.com/in/ada',
               email: 'ada@example.com',
            },
            { profileUrl: 'https://www.linkedin.com/in/bob' },
         ])
      ).toEqual(new Map([['ada', 'ada@example.com']]))
   })

   it('should always cap the ads it asks for, and cut a long ad text', () => {
      expect(adsParams('https://www.linkedin.com/company/acme', 5)).toEqual({
         urls: 'https://www.linkedin.com/company/acme',
         maxResults: 5,
      })

      const [ad] = adsFrom([
         {
            adId: 'ad-1',
            adUrl: 'https://www.linkedin.com/ad-library/detail/ad-1',
            body: 'x'.repeat(500),
         },
      ])

      expect(ad?.body).toHaveLength(300)
      expect(adsFrom([{ headline: 'no id' }])).toEqual([])
   })
})

describe('settings that were missing from a request', () => {
   it('should send an unticked "include reposts" as false, because the data service includes them by default', () => {
      expect(
         postsOfParams('https://www.linkedin.com/in/ada', {
            howMany: 5,
            includeReposts: false,
         })
      ).toEqual({
         urls: 'https://www.linkedin.com/in/ada',
         maxResults: 5,
         includeReposts: false,
      })
   })

   it('should send the people search filters that were missing', () => {
      expect(
         searchPeopleParams({
            keywords: '',
            titles: [],
            companies: [],
            locations: [],
            seniority: [],
            functions: [],
            headcount: [],
            industries: [],
            yearsOfExperience: [],
            changedJobs: false,
            postedRecently: false,
            howMany: 10,
            yearsAtCompany: ['2'],
            pastCompanies: ['Google'],
            pastTitles: ['engineer'],
            schools: ['MIT'],
            names: ['Sam'],
            companyHQLocations: ['London'],
            profileLanguages: ['English'],
         })
      ).toEqual({
         yearsAtCompany: ['2'],
         pastCompanies: ['Google'],
         pastJobTitles: ['engineer'],
         schools: ['MIT'],
         names: ['Sam'],
         companyHQLocations: ['London'],
         profileLanguages: ['English'],
         maxProfiles: 25,
      })
   })
})
