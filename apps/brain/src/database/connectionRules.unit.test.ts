import { describe, expect, it } from 'vitest'

import { CONNECTIONS_CONTRACT_VERSION, type ConnectionsFile } from '@automatedLinkedIn/contracts'

import { type Known, UNSURE_SENTENCE, planStore } from './connectionRules'

const NOW = new Date('2026-10-28T10:00:00Z')
const SESSION = 'session-1'

const person = (slug: string) => ({
   slug,
   name: `Name of ${slug}`,
   headline: 'Works somewhere',
})

const file = (over: Partial<ConnectionsFile> = {}): ConnectionsFile => ({
   contract: CONNECTIONS_CONTRACT_VERSION,
   captured_at: NOW.toISOString(),
   complete: true,
   connections: [],
   ...over,
})

const known = (slug: string, over: Partial<Known> = {}): Known => ({
   id: `id-${slug}`,
   slug,
   status: 'CONNECTED',
   sessionId: null,
   ...over,
})

const plan = (rows: Known[], over: Partial<ConnectionsFile> = {}, verdict: string | null = 'DONE') =>
   planStore(rows, file(over), {
      sessionId: SESSION,
      verdict,
      now: NOW,
   })

describe('planStore', () => {
   it('should add the connections seen for the first time, in the order of the page', () => {
      const changes = plan([known('a')], { connections: [person('a'), person('b'), person('c')] })

      expect(
         changes.filter(({ id }) => id === undefined).map(({ connection }) => [connection?.slug, connection?.position])
      ).toEqual([
         ['b', 1],
         ['c', 2],
      ])
      expect(changes.find(({ id }) => id === 'id-a')).toMatchObject({
         connection: {
            slug: 'a',
            position: 0,
         },
         data: {},
      })
   })

   it('should call a connection gone only when the read was complete and the page no longer lists it', () => {
      expect(plan([known('a'), known('b')], { connections: [person('a')] })).toContainEqual({
         id: 'id-b',
         data: {
            status: 'GONE',
            goneAt: NOW,
         },
      })
      expect(
         plan([known('a'), known('b')], {
            connections: [person('a')],
            complete: false,
         }).some(({ id }) => id === 'id-b')
      ).toBe(false)
   })

   it('should bring a gone, removed, unsure or failed connection back when the page lists it again', () => {
      for (const status of ['GONE', 'REMOVED', 'UNKNOWN', 'FAILED'] as const) {
         expect(plan([known('a', { status })], { connections: [person('a')] })).toContainEqual({
            id: 'id-a',
            connection: expect.objectContaining({ slug: 'a' }),
            data: {
               status: 'CONNECTED',
               failure: null,
               goneAt: null,
               removedAt: null,
            },
         })
      }
   })

   it('should leave a removal that is on its way as it is while the page still lists it', () => {
      expect(
         plan(
            [
               known('a', {
                  status: 'REMOVING',
                  sessionId: 'other',
               }),
            ],
            { connections: [person('a')] }
         )
      ).toEqual([
         {
            id: 'id-a',
            connection: expect.objectContaining({ slug: 'a' }),
            data: {},
         },
      ])
   })

   describe('the removal this run was asked for', () => {
      const asked = known('a', {
         status: 'REMOVING',
         sessionId: SESSION,
      })
      const said = (outcome: 'REMOVED' | 'GONE' | 'UNSURE' | 'NOT_CLICKED') => ({
         complete: false,
         connections: [person('a')],
         removal: {
            slug: 'a',
            outcome,
         },
      })

      it('should settle the connection by what the run said', () => {
         expect(plan([asked], said('REMOVED'))[0]).toMatchObject({
            data: {
               status: 'REMOVED',
               failure: null,
               removedAt: NOW,
            },
         })
         expect(plan([asked], said('GONE'))[0]).toMatchObject({
            data: {
               status: 'GONE',
               goneAt: NOW,
            },
         })
         expect(plan([asked], said('UNSURE'), 'UNKNOWN')[0]).toMatchObject({
            data: {
               status: 'UNKNOWN',
               failure: UNSURE_SENTENCE,
            },
         })
         expect(plan([asked], said('NOT_CLICKED'))[0]).toMatchObject({
            data: {
               status: 'CONNECTED',
               failure: null,
            },
         })
      })

      it('should leave it unsure when the command was delivered twice, since the first delivery may have pressed Remove', () => {
         expect(plan([asked], said('NOT_CLICKED'), 'UNKNOWN').find(({ id }) => id === 'id-a')?.data).toEqual({})
      })

      it('should take the removal of a run that is not this one for nothing', () => {
         expect(
            plan(
               [
                  {
                     ...asked,
                     sessionId: 'other',
                  },
               ],
               said('REMOVED')
            )[0]?.data
         ).toEqual({})
      })
   })

   it('should say an unsure removal went through when a complete read no longer lists the person', () => {
      expect(
         plan(
            [
               known('a', {
                  status: 'UNKNOWN',
                  sessionId: 'older',
               }),
            ],
            { connections: [] }
         )
      ).toContainEqual({
         id: 'id-a',
         data: {
            status: 'REMOVED',
            failure: null,
            removedAt: NOW,
         },
      })
   })

   it('should change nothing when the same file is read again', () => {
      const first = plan([], { connections: [person('a')] })

      expect(first).toHaveLength(1)
      expect(plan([known('a')], { connections: [person('a')] })[0]?.data).toEqual({})
   })
})
