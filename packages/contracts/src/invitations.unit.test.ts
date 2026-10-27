import { describe, expect, it } from 'vitest'

import { INVITATIONS_CONTRACT_VERSION, INVITATION_ID_PATTERN, invitationsFileSchema } from './invitations'

const person = {
   id: '7520752930702983168',
   slug: 'sample-person',
   name: 'Sample Person',
   headline: 'Founder at Sampleworks',
}
const file = {
   contract: INVITATIONS_CONTRACT_VERSION,
   captured_at: '2026-10-27T10:00:00.000Z',
   complete: true,
   invitations: [person],
   outcomes: [],
}

describe('invitationsFileSchema', () => {
   it('should accept a read with and without the optional parts of a request', () => {
      const full = {
         ...person,
         mutual: 'Sample Friend is a mutual connection',
         note: 'Hi, we met at the fair.',
         photoUrl: 'https://media.licdn.com/dms/image/sample',
         id: '7500478553684242432',
      }

      expect(invitationsFileSchema.safeParse(file).success).toBe(true)
      expect(
         invitationsFileSchema.safeParse({
            ...file,
            total: 8,
            invitations: [person, full],
         }).success
      ).toBe(true)
   })

   it('should keep the answers asked for by their outcome', () => {
      const answered = {
         ...file,
         outcomes: [
            {
               id: person.id,
               action: 'ACCEPT',
               outcome: 'ACCEPTED',
            },
         ],
      }

      expect(invitationsFileSchema.safeParse(answered).success).toBe(true)
      expect(
         invitationsFileSchema.safeParse({
            ...answered,
            outcomes: [
               {
                  ...answered.outcomes[0],
                  outcome: 'DONE',
               },
            ],
         }).success
      ).toBe(false)
   })

   it('should refuse an id that is not digits, a picture that is not https, and more than ten answers', () => {
      expect(
         invitationsFileSchema.safeParse({
            ...file,
            invitations: [
               {
                  ...person,
                  id: '12"] x',
               },
            ],
         }).success
      ).toBe(false)
      expect(
         invitationsFileSchema.safeParse({
            ...file,
            invitations: [
               {
                  ...person,
                  photoUrl: 'http://example.com/a.png',
               },
            ],
         }).success
      ).toBe(false)
      expect(
         invitationsFileSchema.safeParse({
            ...file,
            outcomes: Array.from({ length: 11 }, () => ({
               id: person.id,
               action: 'IGNORE',
               outcome: 'IGNORED',
            })),
         }).success
      ).toBe(false)
      expect(INVITATION_ID_PATTERN.test('7520752930702983168')).toBe(true)
   })
})
