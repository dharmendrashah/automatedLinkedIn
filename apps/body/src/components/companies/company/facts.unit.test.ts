import { describe, expect, it } from 'vitest'

import { type Snapshot, addressText, domainOf, factsOf } from './facts'

const company = {
   industry: 'Shipping',
   size: '11-50',
   location: 'Cape Town',
   website: 'http://old.example',
} as Parameters<typeof factsOf>[1]

const snapshot = {
   industry: 'Telecommunications',
   industryCategory: 'Telecommunications',
   founded: 2002,
   employeeRange: '11-50',
   employees: 19,
   followers: 2952,
   website: 'http://www.nova-tech.us',
   ctaUrl: 'http://www.nova-tech.us',
   linkedinUrl: 'https://www.linkedin.com/company/nova-communications-inc/',
   pageType: 'COMPANY',
   active: true,
   verified: false,
   companyId: '1458481',
   jobsUrl: 'https://www.linkedin.com/jobs/search?geoId=92000000&f_C=1458481',
   fetchedAt: '2026-10-29T10:00:00.000Z',
   headquarters: 'Plymouth, Minnesota, United States',
   address: {
      street: '16305 36th Ave N',
      city: 'Plymouth',
      state: 'Minnesota',
      postalCode: '55446',
      country: 'United States',
   },
} as Snapshot

describe('factsOf', () => {
   it('should list every fact of a full read, with the full address and the links', () => {
      expect(
         factsOf(snapshot, company, new Date('2026-10-31T10:00:00.000Z')).map(({ label, value, href }) => [
            label,
            value,
            href,
         ])
      ).toEqual([
         ['Industry', 'Telecommunications', undefined],
         ['Industry category', 'Telecommunications', undefined],
         ['Founded', '2002', undefined],
         ['Company size', '11–50 employees', undefined],
         ['Employees on LinkedIn', '19 exactly (in the 11–50 band)', undefined],
         ['Followers', '2,952', undefined],
         ['Website', 'nova-tech.us', 'http://www.nova-tech.us'],
         ['Call to action', 'nova-tech.us', 'http://www.nova-tech.us'],
         ['Jobs', 'Open jobs on LinkedIn', 'https://www.linkedin.com/jobs/search?geoId=92000000&f_C=1458481'],
         [
            'LinkedIn page',
            'linkedin.com/company/nova-communications-inc',
            'https://www.linkedin.com/company/nova-communications-inc/',
         ],
         ['Page type', 'Company', undefined],
         ['Active status', 'Active', undefined],
         ['Verified', 'Not verified', undefined],
         ['Company id', '1458481', undefined],
         ['Last read', '2 days ago', undefined],
         ['Postal code', '55446', undefined],
         ['Headquarters', '16305 36th Ave N, Plymouth, Minnesota 55446, United States', undefined],
      ])
   })

   it('should fall back to the company row before a read and skip an http website it holds', () => {
      expect(factsOf(null, company).map(({ label, value }) => [label, value])).toEqual([
         ['Industry', 'Shipping'],
         ['Company size', '11–50 employees'],
         ['Headquarters', 'Cape Town'],
      ])
   })
})

describe('addressText and domainOf', () => {
   it('should skip missing parts and strip the scheme', () => {
      expect(
         addressText({
            street: null,
            city: 'Dublin',
            state: null,
            postalCode: 'D02',
            country: 'Ireland',
         })
      ).toBe('Dublin, D02, Ireland')
      expect(domainOf('https://www.stripe.com/')).toBe('stripe.com')
   })
})
