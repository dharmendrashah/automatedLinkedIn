import { describe, expect, it } from 'vitest'

import { sessionWhere, without } from './spiderSessionFilters'

const NOW = new Date('2026-10-31T12:00:00.000Z')

describe('sessionWhere', () => {
   it('should only scope to the owner when nothing is chosen', () => {
      expect(sessionWhere('u1', {}, NOW)).toEqual({
         userId: 'u1',
         AND: [],
      })
   })

   it('should tell a run still going from one that never answered, and match any of the chosen values', () => {
      expect(sessionWhere('u1', { results: ['IN_PROGRESS', 'NO_ANSWER', 'FAILED'] }, NOW).AND).toEqual([
         {
            OR: [
               {
                  status: 'IN_PROGRESS',
                  startedAt: { gte: new Date('2026-10-31T11:30:00.000Z') },
               },
               {
                  status: 'IN_PROGRESS',
                  startedAt: { lt: new Date('2026-10-31T11:30:00.000Z') },
               },
               { status: 'FAILED' },
            ],
         },
      ])
   })

   it('should narrow by every other filter at once, each its own condition', () => {
      const where = sessionWhere(
         'u1',
         {
            accountIds: ['a1'],
            tasks: ['linkedin-invite'],
            verdicts: ['DONE'],
            triggers: ['retry'],
            startedFrom: NOW,
            took: ['OVER_15'],
            proxyIds: ['p1'],
            proxyCountries: ['India'],
            has: ['VIDEO', 'SESSION'],
            retries: 'RETRIED',
            search: ' ada ',
         },
         NOW
      )

      expect(where.AND).toEqual([
         { linkedInAccountId: { in: ['a1'] } },
         { task: { in: ['linkedin-invite'] } },
         { verdict: { in: ['DONE'] } },
         { trigger: { in: ['retry'] } },
         { startedAt: { gte: NOW } },
         { OR: [{ durationMs: { gte: 15 * 60_000 } }] },
         { proxyServerId: { in: ['p1'] } },
         { proxyCountry: { in: ['India'] } },
         { artifacts: { some: { kind: 'video' } } },
         { artifacts: { some: { kind: 'session' } } },
         { retries: { some: {} } },
         {
            OR: expect.arrayContaining([
               { id: 'ada' },
               {
                  linkedInAccount: {
                     email: {
                        contains: 'ada',
                        mode: 'insensitive',
                     },
                  },
               },
            ]),
         },
      ])
   })

   it('should leave one filter out for its own counts', () => {
      expect(
         without(
            {
               tasks: ['x'],
               verdicts: ['DONE'],
            },
            'tasks'
         )
      ).toEqual({ verdicts: ['DONE'] })
   })
})
