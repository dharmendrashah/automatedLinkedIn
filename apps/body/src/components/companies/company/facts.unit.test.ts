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
      expect(factsOf(snapshot, company).map(({ label, value, href }) => [label, value, href])).toEqual([
         ['Industry', 'Telecommunications', undefined],
         ['Industry category', 'Telecommunications', undefined],
         ['Founded', '2002', undefined],
         ['Company size', '11–50 employees', undefined],
         ['On LinkedIn', '19 members', undefined],
         ['Followers', '2,952', undefined],
         ['Website', 'nova-tech.us', 'http://www.nova-tech.us'],
         ['Call to action', 'nova-tech.us', 'http://www.nova-tech.us'],
         [
            'LinkedIn page',
            'linkedin.com/company/nova-communications-inc',
            'https://www.linkedin.com/company/nova-communications-inc/',
         ],
         ['Page type', 'Company', undefined],
         ['Status', 'Active', undefined],
         ['Verified', 'Not verified', undefined],
         ['LinkedIn id', '1458481', undefined],
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
