import { describe, expect, it } from 'vitest'

import { nextCheckText } from './next-check'

const NOW = new Date('2026-10-27T12:00:00Z')
const at = (iso: string) => iso

describe('nextCheckText, once a day', () => {
   it('should say today, tomorrow or the date, in the time zone asked for', () => {
      expect(nextCheckText([at('2026-10-27T15:05:00Z')], NOW, 'DAILY', 'UTC')).toBe(
         'Read automatically once a day. Next check: today at 15:05.'
      )
      expect(nextCheckText([at('2026-10-28T08:42:00Z')], NOW, 'DAILY', 'UTC')).toBe(
         'Read automatically once a day. Next check: tomorrow at 08:42.'
      )
      expect(nextCheckText([at('2026-10-30T08:42:00Z')], NOW, 'DAILY', 'UTC')).toBe(
         'Read automatically once a day. Next check: Fri 30 Oct at 08:42.'
      )
      expect(nextCheckText([at('2026-10-28T08:42:00Z')], NOW, 'DAILY', 'Asia/Kolkata')).toBe(
         'Read automatically once a day. Next check: tomorrow at 14:12.'
      )
   })

   it('should give the earliest and the latest time of several accounts, and how many have no time yet', () => {
      expect(nextCheckText([at('2026-10-28T17:40:00Z'), at('2026-10-28T06:30:00Z'), null], NOW, 'DAILY', 'UTC')).toBe(
         'Read automatically once a day. Next checks: tomorrow between 06:30 and 17:40, each account at its own time. 1 account is not scheduled yet.'
      )
      expect(nextCheckText([at('2026-10-29T08:00:00Z'), at('2026-10-28T06:30:00Z')], NOW, 'DAILY', 'UTC')).toBe(
         'Read automatically once a day. Next checks: tomorrow at 06:30 and Thu 29 Oct at 08:00, each account at its own time.'
      )
   })

   it('should say a check is due when its time has passed, and that it is being scheduled when no account has a time', () => {
      expect(nextCheckText([at('2026-10-27T11:50:00Z')], NOW, 'DAILY', 'UTC')).toBe(
         'Read automatically once a day. Next check: due now.'
      )
      expect(nextCheckText([null, undefined], NOW, 'DAILY', 'UTC')).toBe(
         'Read automatically once a day. The first check is being scheduled.'
      )
   })

   it('should say only how often it is read when no account is shown', () => {
      expect(nextCheckText([], NOW, 'DAILY', 'UTC')).toBe('Read automatically once a day.')
   })
})

describe('nextCheckText, every 2 hours', () => {
   it('should say how long until the earliest read', () => {
      expect(nextCheckText([at('2026-10-27T13:20:00Z')], NOW, 'EVERY_2_HOURS', 'UTC')).toBe(
         'Messages are read automatically every 2 hours. Next read: in about 1 hour 20 minutes.'
      )
      expect(nextCheckText([at('2026-10-27T12:35:00Z')], NOW, 'EVERY_2_HOURS', 'UTC')).toBe(
         'Messages are read automatically every 2 hours. Next read: in about 35 minutes.'
      )
      expect(nextCheckText([at('2026-10-27T14:00:00Z')], NOW, 'EVERY_2_HOURS', 'UTC')).toBe(
         'Messages are read automatically every 2 hours. Next read: in about 2 hours.'
      )
      expect(nextCheckText([at('2026-10-27T12:00:30Z')], NOW, 'EVERY_2_HOURS', 'UTC')).toBe(
         'Messages are read automatically every 2 hours. Next read: in less than a minute.'
      )
   })

   it('should take the earliest of the accounts, and say a read is due when the time has passed', () => {
      expect(nextCheckText([at('2026-10-27T13:20:00Z'), at('2026-10-27T12:10:00Z')], NOW, 'EVERY_2_HOURS')).toBe(
         'Messages are read automatically every 2 hours. Next read: in about 10 minutes. It is the earliest of 2 accounts.'
      )
      expect(nextCheckText([at('2026-10-27T11:00:00Z')], NOW, 'EVERY_2_HOURS')).toBe(
         'Messages are read automatically every 2 hours. Next read: due now.'
      )
   })
})
