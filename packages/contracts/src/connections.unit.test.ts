import { describe, expect, it } from 'vitest'

import {
   CONNECTIONS_CONTRACT_VERSION,
   MAX_CONNECTIONS,
   connectionSlugSchema,
   connectionsFileSchema,
} from './connections'

const person = {
   slug: 'sample-person',
   name: 'Sample Person',
   headline: 'Founder at Sampleworks',
}
const file = {
   contract: CONNECTIONS_CONTRACT_VERSION,
   captured_at: '2026-10-28T10:00:00.000Z',
   complete: true,
   connections: [person],
}

describe('connectionsFileSchema', () => {
   it('should accept a read with and without the optional parts of a connection', () => {
      const full = {
         ...person,
         slug: 'other-person',
         connectedOn: '2026-10-27',
         photoUrl: 'https://media.licdn.com/dms/image/sample',
         messageUrn: 'urn:li:fsd_profile:ACoAADopISA',
      }

      expect(connectionsFileSchema.safeParse(file).success).toBe(true)
      expect(
         connectionsFileSchema.safeParse({
            ...file,
            total: 115,
            connections: [person, full],
         }).success
      ).toBe(true)
   })

   it('should keep what became of a removal by its outcome', () => {
      const removed = {
         ...file,
         removal: {
            slug: person.slug,
            outcome: 'REMOVED',
         },
      }

      expect(connectionsFileSchema.safeParse(removed).success).toBe(true)
      expect(
         connectionsFileSchema.safeParse({
            ...removed,
            removal: {
               slug: person.slug,
               outcome: 'DONE',
            },
         }).success
      ).toBe(false)
   })

   it('should refuse an address that could reach a selector, a picture that is not https, a made-up date, and too many people', () => {
      const bad = (over: Record<string, unknown>) =>
         connectionsFileSchema.safeParse({
            ...file,
            connections: [
               {
                  ...person,
                  ...over,
               },
            ],
         }).success

      expect(bad({ slug: 'a"] x' })).toBe(false)
      expect(bad({ photoUrl: 'http://media.licdn.com/x' })).toBe(false)
      expect(bad({ connectedOn: 'October 27' })).toBe(false)
      expect(bad({ messageUrn: 'urn:li:fsd_profile:../x' })).toBe(false)
      expect(
         connectionsFileSchema.safeParse({
            ...file,
            connections: Array.from({ length: MAX_CONNECTIONS + 1 }, (_, index) => ({
               ...person,
               slug: `person-${index}`,
            })),
         }).success
      ).toBe(false)
   })
})

describe('connectionSlugSchema', () => {
   it('should take the part of a profile address after /in/ as the page writes it, percent signs included, and nothing else', () => {
      expect(connectionSlugSchema.safeParse('ann%C3%A9-lee-1a2b3c').success).toBe(true)
      expect(connectionSlugSchema.safeParse('').success).toBe(false)
      expect(connectionSlugSchema.safeParse('a/b').success).toBe(false)
      expect(connectionSlugSchema.safeParse('a b').success).toBe(false)
   })
})
