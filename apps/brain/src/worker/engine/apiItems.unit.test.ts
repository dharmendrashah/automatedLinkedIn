import { describe, expect, it } from 'vitest'

import { apiItemsOf } from './apiItems'

describe('apiItemsOf', () => {
   it('should make people of the profile links a call names, each once, and drop what is not a profile link', () => {
      const items = apiItemsOf('account.visitProfile', {
         profiles: [
            'https://www.linkedin.com/in/ada-lovelace',
            'https://www.linkedin.com/in/ada-lovelace/',
            'https://www.linkedin.com/company/stripe',
            'not a link',
            42,
         ],
      })

      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
         kind: 'profile',
         slug: 'ada-lovelace',
      })
   })

   it('should make companies for a block that acts on companies, and nothing for a block that has no such field', () => {
      expect(
         apiItemsOf('account.visitCompany', {
            companies: ['https://www.linkedin.com/company/stripe'],
            profiles: ['https://www.linkedin.com/in/ada-lovelace'],
         })
      ).toMatchObject([
         {
            kind: 'company',
            slug: 'stripe',
         },
      ])
      expect(apiItemsOf('account.writePost', { profiles: ['https://www.linkedin.com/in/ada-lovelace'] })).toEqual([])
   })

   it('should give nobody when the call names none, or carries nothing at all', () => {
      expect(apiItemsOf('account.sendMessage', {})).toEqual([])
      expect(apiItemsOf('account.sendMessage', null)).toEqual([])
      expect(apiItemsOf('account.sendMessage', { profiles: 'https://www.linkedin.com/in/ada-lovelace' })).toEqual([])
   })
})
