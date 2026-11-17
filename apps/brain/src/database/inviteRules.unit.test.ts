import { describe, expect, it } from 'vitest'

import {
   CONNECTED_REASON,
   STOPPED_RUNS,
   askable,
   fillNote,
   inviteSentence,
   notesBackAt,
   planInvites,
   sendChange,
   skipReasonOf,
   streakAfter,
   withdrawChange,
} from './inviteRules'

const NOW = new Date('2026-10-30T10:00:00.000Z')
const HOUR = 60 * 60 * 1000
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR)
const daysOut = (times: Date[]) => times.map(at => Math.round((at.getTime() - NOW.getTime()) / (24 * HOUR)))
const PLATFORM = {
   perDay: 20,
   perWeek: 100,
}

describe('planInvites', () => {
   it('should plan 20 a day and stop at 100 a week, then go on when the week rolls', () => {
      const { today, times } = planInvites({
         now: NOW,
         started: [],
         planned: [],
         count: 120,
         limits: PLATFORM,
      })
      const perDay = daysOut(times).reduce<Record<number, number>>(
         (days, day) => ({
            ...days,
            [day]: (days[day] ?? 0) + 1,
         }),
         {}
      )

      expect(today).toBe(20)
      expect(times).toHaveLength(120)
      expect(perDay).toEqual({
         0: 20,
         1: 20,
         2: 20,
         3: 20,
         4: 20,
         7: 20,
      })
   })

   it('should count what the account sent in the last day and week, and what already waits', () => {
      const { today, times } = planInvites({
         now: NOW,
         started: [...Array(15).fill(ago(2)), ...Array(70).fill(ago(72))],
         planned: Array(5).fill(NOW),
         count: 30,
         limits: PLATFORM,
      })

      // 15 sent today and 5 waiting fill today; 70 + 15 + 5 leave 10 for the rest of the week.
      expect(today).toBe(0)
      expect(daysOut(times).slice(0, 10)).toEqual(Array(10).fill(1))
   })

   it("should space one account's planned invites 30 minutes apart from now, and start each next day at its own 24-hour mark", () => {
      const { times } = planInvites({
         now: NOW,
         started: [],
         planned: [],
         count: 6,
         limits: {
            perDay: 4,
            perWeek: 70,
         },
      })
      const minutes = times.map(at => (at.getTime() - NOW.getTime()) / (60 * 1000))

      expect(minutes).toEqual([0, 30, 60, 90, 24 * 60, 24 * 60 + 30])
   })

   it('should plan new invites after the ones already waiting, and keep a full day inside its 24 hours', () => {
      const waiting = planInvites({
         now: NOW,
         started: [],
         planned: [new Date(NOW.getTime() + 60 * 60 * 1000)],
         count: 2,
         limits: PLATFORM,
      })

      expect(waiting.times.map(at => (at.getTime() - NOW.getTime()) / (60 * 1000))).toEqual([90, 120])

      const crowded = planInvites({
         now: NOW,
         started: [],
         planned: [],
         count: 200,
         limits: {
            perDay: 100,
            perWeek: 700,
         },
         days: 1,
      }).times

      expect(crowded).toHaveLength(100)
      expect(Math.max(...crowded.map(at => at.getTime())) - NOW.getTime()).toBeLessThan(24 * HOUR)
      expect(
         Math.min(...crowded.slice(1).map((at, index) => at.getTime() - (crowded[index]?.getTime() ?? 0)))
      ).toBeGreaterThanOrEqual(10 * 60 * 1000)
   })

   it('should leave out what 14 days cannot hold', () => {
      expect(
         planInvites({
            now: NOW,
            started: [],
            planned: [],
            count: 1000,
            limits: PLATFORM,
         }).times.length
      ).toBeLessThan(1000)
   })

   it('should use the limits of the account and plan only as many days ahead as asked', () => {
      const { today, times } = planInvites({
         now: NOW,
         started: [],
         planned: [],
         count: 100,
         limits: {
            perDay: 14,
            perWeek: 70,
         },
         days: 1,
      })

      expect(today).toBe(14)
      expect(times).toHaveLength(14)
   })
})

describe('inviteSentence', () => {
   it('should say what is safe today, how the rest spreads, what is left out and what was skipped', () => {
      expect(
         inviteSentence({
            now: NOW,
            today: 20,
            times: [NOW, new Date(NOW.getTime() + 24 * HOUR)],
            selected: 5,
            skipped: {
               CONNECTED: 2,
               DO_NOT_CONTACT: 0,
            },
         })
      ).toBe(
         'You can safely send 20 today. 5 selected: 1 today, the rest over the next 1 day. 1 more person than 14 days can hold is left out. Skipped: 2 already connected.'
      )
      expect(
         inviteSentence({
            now: NOW,
            today: 20,
            times: [NOW],
            selected: 1,
            skipped: {},
         })
      ).toBe('You can safely send 20 today. 1 selected: all today.')
      expect(
         inviteSentence({
            now: NOW,
            today: 14,
            times: Array.from({ length: 14 }, (_, index) => new Date(NOW.getTime() + index * 30 * 60 * 1000)),
            selected: 14,
            skipped: {},
         })
      ).toBe('You can safely send 14 today. 14 selected: all today, over about 7 hours.')
   })
})

describe('skipReasonOf', () => {
   it('should give the first reason that holds', () => {
      expect(
         skipReasonOf({
            doNotContact: true,
            connected: true,
            requestPending: false,
            invitedRecently: false,
         })
      ).toBe('DO_NOT_CONTACT')
      expect(
         skipReasonOf({
            doNotContact: false,
            connected: false,
            requestPending: false,
            invitedRecently: true,
         })
      ).toBe('INVITED')
      expect(
         skipReasonOf({
            doNotContact: false,
            connected: false,
            requestPending: false,
            invitedRecently: false,
         })
      ).toBeUndefined()
   })
})

describe('fillNote', () => {
   it('should put in the first name and the company, and drop an empty note', () => {
      expect(
         fillNote('Hi {first_name}, saw {company} is hiring.', {
            first_name: 'Ada',
            company: 'Analytical',
         })
      ).toBe('Hi Ada, saw Analytical is hiring.')
      expect(fillNote('Hi {first_name} at {company}', { first_name: 'Ada' })).toBe('Hi Ada at')
      expect(fillNote('  ', { first_name: 'Ada' })).toBeUndefined()
   })

   it('should pick one option of each spintax group, fall back, and keep to the 200 characters of a note', () => {
      expect(fillNote('{Hi|Hello} {first_name:there}!', {})).toMatch(/^(Hi|Hello) there!$/)
      expect(fillNote('x'.repeat(300), {})).toHaveLength(200)
   })
})

describe('sendChange and withdrawChange', () => {
   it('should keep an unclear send from going again and give up a send that never got its turn after 3 tries', () => {
      expect(sendChange('UNSURE', 0, NOW).state).toBe('UNKNOWN')
      expect(sendChange('SENT', 0, NOW, '42')).toMatchObject({
         state: 'SENT',
         invitedAt: NOW,
         memberId: '42',
      })
      expect(sendChange('NOT_SENT', 0, NOW)).toEqual({
         state: 'QUEUED',
         reason: null,
         tries: 1,
      })
      expect(sendChange('NOT_SENT', 2, NOW).state).toBe('FAILED')
      expect(sendChange('NOTE_REFUSED', 0, NOW).state).toBe('FAILED')
      expect(sendChange('SENT_WITHOUT_NOTE', 0, NOW, '42')).toEqual({
         state: 'SENT',
         reason: 'Sent without the note: no free notes left this month.',
         invitedAt: NOW,
         memberId: '42',
      })
      expect(sendChange('REFUSED', 0, NOW).state).toBe('FAILED')
   })

   it('should not use a try of an invite that never had its turn in a run LinkedIn stopped, and clear the unsure sentence', () => {
      for (const verdict of ['BLOCKED', 'LIMIT_REACHED', 'RESTRICTED', 'SIGNED_OUT']) {
         expect(STOPPED_RUNS.has(verdict)).toBe(true)
      }

      expect(STOPPED_RUNS.has('DONE')).toBe(false)
      expect(sendChange('NOT_SENT', 2, NOW, undefined, true)).toEqual({
         state: 'QUEUED',
         reason: null,
      })
      expect(sendChange('NOT_SENT', 2, NOW)).toMatchObject({ state: 'FAILED' })
      expect(sendChange('SENT', 2, NOW, undefined, true)).toMatchObject({ state: 'SENT' })
   })

   it('should skip a connection with the sentence the people index reads, never the old guess', () => {
      expect(sendChange('ALREADY_CONNECTED', 0, NOW)).toEqual({
         state: 'SKIPPED',
         reason: CONNECTED_REASON,
      })
      expect(CONNECTED_REASON).not.toBe('Already connected on LinkedIn.')
   })

   it('should keep the free notes out until the first day of the next month', () => {
      expect(notesBackAt(new Date('2026-10-31T23:00:00.000Z'))).toEqual(new Date('2026-11-01T00:00:00.000Z'))
      expect(notesBackAt(new Date('2026-12-15T10:00:00.000Z'))).toEqual(new Date('2027-01-01T00:00:00.000Z'))
   })

   it('should call an invite no longer pending withdrawn and try an unclear withdrawal again', () => {
      expect(withdrawChange('NOT_PENDING', 0, NOW).state).toBe('WITHDRAWN')
      expect(withdrawChange('UNSURE', 0, NOW).state).toBe('WITHDRAW_QUEUED')
   })

   it('should keep an invite SENT, not WITHDRAWN, when the withdrawal gives up after 3 tries', () => {
      expect(withdrawChange('UNSURE', 2, NOW)).toEqual({
         state: 'SENT',
         reason: 'Withdraw failed after 3 tries; the invite may still be pending on LinkedIn.',
         tries: 3,
      })
   })
})

describe('askable', () => {
   const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
   const good = {
      id: ID(1),
      slug: 'ada-l',
      name: 'Ada Lovelace',
   }

   it('keeps what the invite task accepts and sets aside what its schema would refuse', () => {
      const accented = {
         id: ID(2),
         slug: 'fran\u00e7ois-d',
         name: 'Fran\u00e7ois D',
      }
      const longName = {
         id: ID(3),
         slug: 'grace-h',
         name: 'G'.repeat(201),
      }
      const longNote = {
         id: ID(4),
         slug: 'alan-t',
         name: 'Alan T',
         note: 'n'.repeat(201),
      }
      const result = askable([good, accented, longName, longNote], [])

      expect(result.sends).toEqual([good])
      expect(result.refusedSends.map(({ id }) => id)).toEqual([ID(2), ID(3), ID(4)])
   })

   it('treats a withdrawal the same way', () => {
      const result = askable(
         [],
         [
            good,
            {
               id: ID(2),
               slug: 'fran\u00e7ois-d',
               name: 'Fran\u00e7ois D',
            },
         ]
      )

      expect(result.withdrawals).toEqual([good])
      expect(result.refusedWithdrawals.map(({ id }) => id)).toEqual([ID(2)])
   })

   it('leaves a note out of the input when there is none, as the task expects', () => {
      expect(
         askable(
            [
               {
                  ...good,
                  note: undefined,
               },
            ],
            []
         ).sends
      ).toHaveLength(1)
   })
})

describe('streakAfter', () => {
   it('should count no-Connect answers and trip at six, then start again', () => {
      expect(streakAfter(4, ['NO_CONNECT', 'NO_CONNECT'])).toEqual({
         streak: 0,
         trip: true,
      })
      expect(streakAfter(2, ['NO_CONNECT'])).toEqual({
         streak: 3,
         trip: false,
      })
   })

   it('should reset on an answer that proves the page was read, in file order', () => {
      for (const outcome of ['SENT', 'SENT_WITHOUT_NOTE', 'ALREADY_PENDING', 'ALREADY_CONNECTED'] as const) {
         expect(streakAfter(5, [outcome])).toEqual({
            streak: 0,
            trip: false,
         })
      }

      expect(streakAfter(4, ['NO_CONNECT', 'SENT', 'NO_CONNECT'])).toEqual({
         streak: 1,
         trip: false,
      })
   })

   it('should leave the streak alone for answers that say nothing about the page', () => {
      expect(streakAfter(3, ['NOT_SENT', 'NOT_AVAILABLE'])).toEqual({
         streak: 3,
         trip: false,
      })
      expect(streakAfter(0, [])).toEqual({
         streak: 0,
         trip: false,
      })
   })
})
