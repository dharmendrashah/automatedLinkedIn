import { describe, expect, it } from 'vitest'

import { type Snapshot, addressText, domainOf, factsOf } from './facts'

const company = {
   industry: 'Shipping',
   size: '11-50',
   location: 'Cape Town',
   website: 'http://old.example',
} as Parameters<typeof factsOf>[1]

const snapshot = {
   industry: 'Maritime',
   industryCategory: 'Maritime',
   founded: 2001,
   employeeRange: '2-10',
   employees: 12,
   followers: 2014,
   website: 'http://dutoityachtdesign.co.za/',
   headquarters: 'Montague Gardens, Western Cape, South Africa',
   address: {
      street: 'Bolt Ave',
      city: 'Montague Gardens',
      state: 'Western Cape',
      postalCode: '7441',
      country: 'South Africa',
   },
} as Snapshot

describe('factsOf', () => {
   it('should list every fact of a full read, with the full address and the website link', () => {
      expect(factsOf(snapshot, company).map(({ label, value, href }) => [label, value, href])).toEqual([
         ['Industry', 'Maritime', undefined],
         ['Founded', '2001', undefined],
         ['Company size', '2–10 employees', undefined],
         ['On LinkedIn', '12 members', undefined],
         ['Followers', '2,014', undefined],
         ['Website', 'dutoityachtdesign.co.za', 'http://dutoityachtdesign.co.za/'],
         ['Headquarters', 'Bolt Ave, Montague Gardens, Western Cape 7441, South Africa', undefined],
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
