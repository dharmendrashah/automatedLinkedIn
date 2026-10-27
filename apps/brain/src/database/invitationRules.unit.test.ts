import { describe, expect, it } from 'vitest'

import { INVITATIONS_CONTRACT_VERSION, type InvitationsFile } from '@automatedLinkedIn/contracts'

import { type Known, UNSURE_SENTENCE, planStore } from './invitationRules'

const NOW = new Date('2026-10-27T10:00:00.000Z')
const SESSION = 's1'

const person = (n: number) => ({
   id: `75207529307029831${String(n).padStart(2, '0')}`,
   slug: `person-${n}`,
   name: `Person ${n}`,
   headline: `Works at ${n}`,
})

const file = (listed: number[], rest: Partial<InvitationsFile> = {}): InvitationsFile => ({
   contract: INVITATIONS_CONTRACT_VERSION,
   captured_at: NOW.toISOString(),
   complete: true,
   invitations: listed.map(person),
   outcomes: [],
   ...rest,
})

const row = (n: number, rest: Partial<Known> = {}): Known => ({
   id: `row-${n}`,
   linkedInId: person(n).id,
   status: 'PENDING',
   action: null,
   sessionId: null,
   ...rest,
})

const plan = (known: Known[], read: InvitationsFile, verdict: string | null = 'DONE') =>
   planStore(known, read, {
      sessionId: SESSION,
      verdict,
      now: NOW,
   })

describe('planStore', () => {
   it('should add a request seen for the first time, in the order of the page, and refresh one already known', () => {
      const changes = plan([row(2)], file([1, 2]))

      expect(changes).toHaveLength(2)
      expect(changes[0]).toMatchObject({
         invitation: {
            id: person(1).id,
            position: 0,
         },
         data: {},
      })
      expect(changes[0]?.id).toBeUndefined()
      expect(changes[1]).toMatchObject({
         id: 'row-2',
         invitation: { position: 1 },
         data: {},
      })
   })

   it('should call a waiting request gone when a complete read no longer lists it, and keep it when the read was not complete', () => {
      expect(plan([row(1)], file([]))).toEqual([
         {
            id: 'row-1',
            data: {
               status: 'GONE',
               goneAt: NOW,
            },
         },
      ])
      expect(plan([row(1)], file([], { complete: false }))).toEqual([])
   })

   it('should bring a gone, failed, unsure or answered request back to waiting when it is listed again', () => {
      for (const status of ['GONE', 'FAILED', 'UNKNOWN', 'ACCEPTED', 'IGNORED'] as const) {
         expect(plan([row(1, { status })], file([1]))[0]).toMatchObject({
            id: 'row-1',
            data: {
               status: 'PENDING',
               action: null,
               failure: null,
               goneAt: null,
            },
         })
      }
   })

   it('should leave a request whose answer is on its way as it is when it is listed', () => {
      expect(
         plan(
            [
               row(1, {
                  status: 'QUEUED',
                  action: 'ACCEPT',
                  sessionId: 'other',
               }),
            ],
            file([1])
         )[0]?.data
      ).toEqual({})
   })

   it('should settle the requests a run was asked to answer from what it said of each', () => {
      const asked = { sessionId: SESSION }
      const read = file([4], {
         outcomes: [
            {
               id: person(1).id,
               action: 'ACCEPT',
               outcome: 'ACCEPTED',
            },
            {
               id: person(2).id,
               action: 'IGNORE',
               outcome: 'IGNORED',
            },
            {
               id: person(3).id,
               action: 'ACCEPT',
               outcome: 'GONE',
            },
            {
               id: person(4).id,
               action: 'ACCEPT',
               outcome: 'UNSURE',
            },
            {
               id: person(5).id,
               action: 'ACCEPT',
               outcome: 'NOT_CLICKED',
            },
         ],
      })
      const changes = plan(
         [1, 2, 3, 4, 5].map(n =>
            row(n, {
               ...asked,
               status: 'QUEUED',
               action: 'ACCEPT',
            })
         ),
         read,
         'UNKNOWN'
      )
      const statusOf = (n: number) => changes.find(({ id }) => id === `row-${n}`)?.data

      expect(statusOf(1)).toMatchObject({
         status: 'ACCEPTED',
         answeredAt: NOW,
      })
      expect(statusOf(2)).toMatchObject({
         status: 'IGNORED',
         action: 'IGNORE',
      })
      expect(statusOf(3)).toMatchObject({ status: 'GONE' })
      expect(statusOf(4)).toMatchObject({
         status: 'UNKNOWN',
         failure: UNSURE_SENTENCE,
      })
      expect(statusOf(5)).toMatchObject({
         status: 'PENDING',
         action: null,
      })
   })

   it('should read a request after a command delivered again by the page: waiting when it is still listed, answered when it left', () => {
      const read = file([1], {
         outcomes: [
            {
               id: person(1).id,
               action: 'IGNORE',
               outcome: 'NOT_CLICKED',
            },
         ],
      })
      const known = row(1, {
         sessionId: SESSION,
         status: 'UNKNOWN',
         action: 'IGNORE',
      })

      expect(plan([known], read, 'UNKNOWN')[0]?.data).toEqual({
         status: 'PENDING',
         action: null,
         failure: null,
         goneAt: null,
      })
      expect(plan([known], file([]), 'UNKNOWN')[0]?.data).toMatchObject({ status: 'IGNORED' })
   })

   it('should take an unsure request that left the page as answered the way it was clicked, and only after a complete read', () => {
      const unsure = row(1, {
         status: 'UNKNOWN',
         action: 'ACCEPT',
      })

      expect(plan([unsure], file([]))[0]?.data).toMatchObject({
         status: 'ACCEPTED',
         answeredAt: NOW,
      })
      expect(plan([unsure], file([], { complete: false }))).toEqual([])
   })

   it('should not touch the requests of another run, or answered ones that stay gone', () => {
      const read = file([], {
         outcomes: [
            {
               id: person(1).id,
               action: 'ACCEPT',
               outcome: 'ACCEPTED',
            },
         ],
      })

      expect(
         plan(
            [
               row(1, {
                  sessionId: 'another',
                  status: 'QUEUED',
               }),
            ],
            read
         )
      ).toEqual([])
      expect(plan([row(2, { status: 'ACCEPTED' }), row(3, { status: 'GONE' })], file([]))).toEqual([])
   })
})
