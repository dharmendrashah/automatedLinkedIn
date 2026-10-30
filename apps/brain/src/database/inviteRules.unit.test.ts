import { describe, expect, it } from 'vitest'

import { fillNote, inviteSentence, planInvites, sendChange, skipReasonOf, withdrawChange } from './inviteRules'

const NOW = new Date('2026-10-30T10:00:00.000Z')
const HOUR = 60 * 60 * 1000
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR)
const daysOut = (times: Date[]) => times.map(at => Math.round((at.getTime() - NOW.getTime()) / (24 * HOUR)))

describe('planInvites', () => {
   it('should plan 20 a day and stop at 100 a week, then go on when the week rolls', () => {
      const { today, times } = planInvites({
         now: NOW,
         started: [],
         planned: [],
         count: 120,
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
      })

      // 15 sent today and 5 waiting fill today; 70 + 15 + 5 leave 10 for the rest of the week.
      expect(today).toBe(0)
      expect(daysOut(times).slice(0, 10)).toEqual(Array(10).fill(1))
   })

   it('should leave out what 14 days cannot hold', () => {
      expect(
         planInvites({
            now: NOW,
            started: [],
            planned: [],
            count: 1000,
         }).times.length
      ).toBeLessThan(1000)
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
            name: 'Ada Lovelace',
            company: 'Analytical',
         })
      ).toBe('Hi Ada, saw Analytical is hiring.')
      expect(
         fillNote('Hi {first_name} at {company}', {
            name: 'Ada',
            company: null,
         })
      ).toBe('Hi Ada at')
      expect(
         fillNote('  ', {
            name: 'Ada',
            company: null,
         })
      ).toBeUndefined()
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
         tries: 1,
      })
      expect(sendChange('NOT_SENT', 2, NOW).state).toBe('FAILED')
      expect(sendChange('NOTE_REFUSED', 0, NOW).state).toBe('FAILED')
      expect(sendChange('REFUSED', 0, NOW).state).toBe('FAILED')
   })

   it('should call an invite no longer pending withdrawn and try an unclear withdrawal again', () => {
      expect(withdrawChange('NOT_PENDING', 0, NOW).state).toBe('WITHDRAWN')
      expect(withdrawChange('UNSURE', 0, NOW).state).toBe('WITHDRAW_QUEUED')
      expect(withdrawChange('UNSURE', 2, NOW).state).toBe('WITHDRAWN')
   })
})
