import { describe, expect, it } from 'vitest'

import { type ConnectionRow, type ConversationRow, type InviteRow, type Sources, draftPeople } from './peopleIndex'

const at = (day: string) => new Date(`${day}T10:00:00.000Z`)

const connection = (rest: Partial<ConnectionRow>): ConnectionRow => ({
   id: 'con-1',
   accountId: 'acc-1',
   name: 'Ada',
   headline: 'Engines',
   photoUrl: null,
   status: 'CONNECTED',
   connectedOn: at('2026-09-01'),
   seenAt: at('2026-09-02'),
   createdAt: at('2026-09-02'),
   ...rest,
})

const conversation = (rest: Partial<ConversationRow>): ConversationRow => ({
   id: 'conv-1',
   accountId: 'acc-1',
   name: 'Ada',
   photoUrl: null,
   lastMessageAt: at('2026-10-20'),
   lastDirection: 'ME',
   lastReplyAt: at('2026-10-20'),
   waitingSince: null,
   doneAt: null,
   lastText: null,
   theirLastAt: at('2026-10-10'),
   createdAt: at('2026-10-01'),
   ...rest,
})

const invite = (rest: Partial<InviteRow>): InviteRow => ({
   id: 'inv-1',
   clientId: 'client-1',
   accountId: 'acc-1',
   name: 'Ada',
   state: 'SENT',
   invitedAt: at('2026-10-05'),
   acceptedAt: null,
   createdAt: at('2026-10-04'),
   ...rest,
})

const sources = (rest: Partial<Sources>): Sources => ({
   requests: [],
   connections: [],
   conversations: [],
   members: [],
   targets: [],
   invites: [],
   facts: null,
   ...rest,
})

const draft = (rest: Partial<Sources>) => {
   const [person] = draftPeople(sources(rest), () => 'client-1', 'client-1', 'https://www.linkedin.com/in/ada/')

   if (!person) {
      throw new Error('no person')
   }

   return person
}

describe('draftPeople dates LinkedIn did not give', () => {
   it('should show the name, headline, photo and company of the profile read first: the read is final', () => {
      expect(
         draft({
            connections: [connection({ photoUrl: 'https://media.example/old.jpg' })],
            facts: {
               name: 'Ada Lovelace',
               headline: 'Analyst of engines',
               photo: 'https://media.example/ada.jpg',
               title: 'Analyst',
               company: 'Analytical Engines',
               companySlug: null,
               country: null,
               premium: null,
            },
         })
      ).toMatchObject({
         name: 'Ada Lovelace',
         headline: 'Analyst of engines',
         photoUrl: 'https://media.example/ada.jpg',
         company: 'Analytical Engines',
      })
   })
   it('should not date a reason or a touch in 1970, and fall back to when the conversation was first seen', () => {
      const person = draft({
         conversations: [
            conversation({
               lastMessageAt: new Date(0),
               lastReplyAt: new Date(0),
               theirLastAt: new Date(0),
            }),
         ],
      })

      expect(person).toMatchObject({
         reasonText: 'Messaged',
         reasonAt: at('2026-10-01'),
         lastSentAt: null,
         lastReceivedAt: null,
      })
      expect(person.lastTouchAt.getFullYear()).toBeGreaterThan(2003)
   })
})

describe('draftPeople filter fields', () => {
   it('should keep when the connection began, and the newest message each way', () => {
      expect(
         draft({
            connections: [
               connection({}),
               connection({
                  id: 'con-2',
                  connectedOn: at('2026-09-15'),
               }),
            ],
            conversations: [
               conversation({}),
               conversation({
                  id: 'conv-2',
                  lastReplyAt: at('2026-10-12'),
                  theirLastAt: at('2026-10-25'),
               }),
            ],
         })
      ).toMatchObject({
         connectedAt: at('2026-09-01'),
         lastSentAt: at('2026-10-20'),
         lastReceivedAt: at('2026-10-25'),
      })
   })

   it('should not count a removed connection, nor a conversation never answered', () => {
      expect(
         draft({
            connections: [connection({ status: 'REMOVED' })],
            conversations: [
               conversation({
                  lastReplyAt: null,
                  theirLastAt: null,
               }),
            ],
         })
      ).toMatchObject({
         connectedAt: null,
         lastSentAt: null,
         lastReceivedAt: null,
      })
   })

   it.each([
      [[], 'NONE'],
      [[invite({ state: 'CANCELLED' })], 'NONE'],
      [[invite({ state: 'QUEUED' })], 'QUEUED'],
      [[invite({ state: 'UNKNOWN' })], 'PENDING'],
      [[invite({ state: 'ACCEPTED' })], 'ACCEPTED'],
      [
         [
            invite({ state: 'WITHDRAWN' }),
            invite({
               id: 'inv-2',
               state: 'QUEUED',
               createdAt: at('2026-10-29'),
            }),
         ],
         'QUEUED',
      ],
      [[invite({ state: 'FAILED' })], 'ENDED'],
   ] as const)('should say where the newest invite stands', (invites, state) => {
      expect(
         draft({
            targets: [
               {
                  id: 'target-1',
                  clientId: 'client-1',
                  name: 'Ada',
                  headline: null,
                  company: null,
                  status: 'NEW',
                  url: 'https://www.linkedin.com/in/ada/',
                  createdAt: at('2026-10-01'),
               },
            ],
            invites: [...invites],
         }).inviteState
      ).toBe(state)
   })

   it('should take the title, the country, Premium, the company slug and a missing company from the profile read', () => {
      expect(
         draft({
            connections: [connection({})],
            facts: {
               name: null,
               headline: null,
               photo: null,
               title: 'Founder',
               company: 'Lumen Labs',
               companySlug: 'lumen-labs',
               country: 'France',
               premium: true,
            },
         })
      ).toMatchObject({
         title: 'Founder',
         company: 'Lumen Labs',
         companySlug: 'lumen-labs',
         country: 'France',
         premium: true,
         profileRead: true,
      })
      expect(draft({ connections: [connection({})] })).toMatchObject({
         title: null,
         country: null,
         companySlug: null,
         premium: null,
         profileRead: false,
      })
   })
})
