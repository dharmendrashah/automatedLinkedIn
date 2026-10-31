import { describe, expect, it } from 'vitest'

import { INVITE_LIMITS, inviteInputSchema, invitesFileSchema } from './invites'

const ID = '0199a2b3-1c2d-7e3f-8a4b-5c6d7e8f9a0b'

describe('inviteInputSchema', () => {
   it('should take invites with and without a note and fill an empty withdraw list', () => {
      expect(
         inviteInputSchema.parse({
            send: [
               {
                  id: ID,
                  slug: 'ada-lovelace',
                  name: 'Ada Lovelace',
                  note: 'Hi Ada',
               },
            ],
         })
      ).toEqual({
         send: [
            {
               id: ID,
               slug: 'ada-lovelace',
               name: 'Ada Lovelace',
               note: 'Hi Ada',
            },
         ],
         withdraw: [],
      })
   })

   it('should refuse nothing to do, too many invites, a long note and a slug that could reach a selector', () => {
      const invite = {
         id: ID,
         slug: 'ada',
         name: 'Ada',
      }

      expect(inviteInputSchema.safeParse({}).success).toBe(false)
      expect(inviteInputSchema.safeParse({ send: Array(INVITE_LIMITS.perRun + 1).fill(invite) }).success).toBe(false)
      expect(
         inviteInputSchema.safeParse({
            send: [
               {
                  ...invite,
                  note: 'x'.repeat(INVITE_LIMITS.noteChars + 1),
               },
            ],
         }).success
      ).toBe(false)
      expect(
         inviteInputSchema.safeParse({
            send: [
               {
                  ...invite,
                  slug: 'a"]',
               },
            ],
         }).success
      ).toBe(false)
   })
})

describe('invitesFileSchema', () => {
   it('should take outcomes with a member number and refuse an unknown outcome', () => {
      const file = {
         contract: 1,
         captured_at: '2026-10-30T10:00:00.000Z',
         sent: [
            {
               id: ID,
               outcome: 'SENT',
               memberId: '736436677',
            },
         ],
         withdrawn: [],
      }

      expect(invitesFileSchema.parse(file)).toEqual(file)
      expect(
         invitesFileSchema.parse({
            ...file,
            contract: 2,
            sent: [
               {
                  id: ID,
                  outcome: 'SENT_WITHOUT_NOTE',
               },
            ],
         }).sent[0]?.outcome
      ).toBe('SENT_WITHOUT_NOTE')
      expect(
         invitesFileSchema.safeParse({
            ...file,
            contract: 3,
         }).success
      ).toBe(false)
      expect(
         invitesFileSchema.safeParse({
            ...file,
            sent: [
               {
                  id: ID,
                  outcome: 'MAYBE',
               },
            ],
         }).success
      ).toBe(false)
   })
})
