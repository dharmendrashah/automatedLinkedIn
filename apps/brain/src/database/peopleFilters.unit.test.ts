import { describe, expect, it } from 'vitest'

import { peopleFiltersSchema } from '@automatedLinkedIn/contracts'

import { PEOPLE_SORTS, orderOf, peopleWhere } from './peopleFilters'

const where = (input: Record<string, unknown>) => peopleWhere(peopleFiltersSchema.parse(input))

describe('peopleWhere', () => {
   it('asks nothing of an empty filter', () => {
      expect(where({})).toEqual([])
   })

   it('matches text case-insensitively and lists as alternatives', () => {
      expect(
         where({
            name: 'ada',
            companies: ['Lumen Labs', 'Kiefer'],
            title: 'founder',
            countries: ['France'],
         })
      ).toEqual([
         {
            name: {
               contains: 'ada',
               mode: 'insensitive',
            },
         },
         {
            OR: [
               {
                  company: {
                     equals: 'Lumen Labs',
                     mode: 'insensitive',
                  },
               },
               {
                  company: {
                     equals: 'Kiefer',
                     mode: 'insensitive',
                  },
               },
            ],
         },
         {
            title: {
               contains: 'founder',
               mode: 'insensitive',
            },
         },
         {
            OR: [
               {
                  country: {
                     equals: 'France',
                     mode: 'insensitive',
                  },
               },
            ],
         },
      ])
   })

   it('reads connected, an account, and a connected range', () => {
      expect(
         where({
            connection: 'CONNECTED',
            connectedTo: 'acc-1',
            connectedAt: { from: '2026-10-01T00:00:00.000Z' },
         })
      ).toEqual([
         { connectedAt: { not: null } },
         {
            links: {
               some: {
                  accountId: 'acc-1',
                  kind: 'CONNECTION',
               },
            },
         },
         { connectedAt: { gte: new Date('2026-10-01T00:00:00.000Z') } },
      ])
      expect(where({ connection: 'NOT_CONNECTED' })).toEqual([{ connectedAt: null }])
   })

   it('reads the activity and the owner work filters', () => {
      expect(
         where({
            invites: ['PENDING'],
            lastReceived: {
               from: '2026-10-01T00:00:00.000Z',
               to: '2026-10-30T23:59:59.999Z',
            },
            neverMessaged: true,
            replyWaiting: true,
            labels: ['hot', 'founder'],
            labelsMode: 'all',
            statuses: ['NEW'],
            profileRead: false,
            premium: true,
         })
      ).toEqual([
         { premium: true },
         { inviteState: { in: ['PENDING'] } },
         {
            lastReceivedAt: {
               gte: new Date('2026-10-01T00:00:00.000Z'),
               lte: new Date('2026-10-30T23:59:59.999Z'),
            },
         },
         { links: { none: { kind: 'CONVERSATION' } } },
         { priority: 3 },
         { labels: { hasEvery: ['hot', 'founder'] } },
         { status: { in: ['NEW'] } },
         { profileRead: false },
      ])
      expect(where({ labels: ['hot'] })).toEqual([{ labels: { hasSome: ['hot'] } }])
      expect(where({ noLabels: true })).toEqual([{ labels: { isEmpty: true } }])
   })
})

describe('orderOf', () => {
   it('keeps the tab order without a sort, and puts empty values last with one', () => {
      expect(orderOf('NEEDS_ME')).toEqual([{ priority: 'desc' }, { lastTouchAt: 'desc' }, { id: 'desc' }])
      expect(orderOf('EVERYONE')).toEqual([{ lastTouchAt: 'desc' }, { id: 'desc' }])
      expect(
         orderOf('EVERYONE', {
            by: 'connectedAt',
            desc: false,
         })
      ).toEqual([
         {
            connectedAt: {
               sort: 'asc',
               nulls: 'last',
            },
         },
         { id: 'desc' },
      ])
   })

   it('sorts only by the known columns', () => {
      expect(PEOPLE_SORTS).toEqual([
         'name',
         'connectedAt',
         'lastSentAt',
         'lastReceivedAt',
         'lastTouchAt',
         'firstSeenAt',
      ])
   })
})
