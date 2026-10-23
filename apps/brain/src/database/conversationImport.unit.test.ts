import { describe, expect, it } from 'vitest'

import { summaryOf, timelineOf, wallClock } from './conversationImport'

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 22, hour, minute))

describe('wallClock', () => {
   it('should keep the day and time LinkedIn showed, as if they were UTC', () => {
      expect(wallClock('2024-01-25', '17:18')?.toISOString()).toBe('2024-01-25T17:18:00.000Z')
      expect(wallClock('2024-01-25', undefined)?.toISOString()).toBe('2024-01-25T00:00:00.000Z')
   })

   it('should give nothing when there is no day or the day is not a date', () => {
      expect(wallClock(undefined, '17:18')).toBeUndefined()
      expect(wallClock('2024-13-45', '17:18')).toBeUndefined()
   })
})

describe('timelineOf', () => {
   const base = at(12)

   it('should use the time of each message, and place one without a time a minute after the one before', () => {
      const times = timelineOf(
         [
            {
               date: '2026-10-22',
               time: '09:00',
            },
            {},
            {
               date: '2026-10-22',
               time: '09:30',
            },
            {},
         ],
         base
      )

      expect(times.map(time => time.toISOString())).toEqual([
         '2026-10-22T09:00:00.000Z',
         '2026-10-22T09:01:00.000Z',
         '2026-10-22T09:30:00.000Z',
         '2026-10-22T09:31:00.000Z',
      ])
   })

   it('should start from the base when even the first message has no time, and never go back in time', () => {
      expect(timelineOf([{}, {}], base).map(time => time.toISOString())).toEqual([
         '2026-10-22T12:01:00.000Z',
         '2026-10-22T12:02:00.000Z',
      ])
      expect(
         timelineOf(
            [
               {
                  date: '2026-10-22',
                  time: '10:00',
               },
               {
                  date: '2026-10-22',
                  time: '09:00',
               },
            ],
            base
         ).map(time => time.getTime())
      ).toEqual([at(10).getTime(), at(10).getTime()])
   })
})

describe('summaryOf', () => {
   it('should say nothing for a conversation without messages', () => {
      expect(summaryOf([])).toEqual({
         messageCount: 0,
         lastMessageAt: null,
         lastDirection: null,
         waitingSince: null,
         lastReplyAt: null,
      })
   })

   it('should say since when they wait: the first of their last run of messages', () => {
      expect(
         summaryOf([
            {
               direction: 'THEM',
               sentAt: at(8),
            },
            {
               direction: 'ME',
               sentAt: at(9),
            },
            {
               direction: 'THEM',
               sentAt: at(10),
            },
            {
               direction: 'THEM',
               sentAt: at(11),
            },
         ])
      ).toEqual({
         messageCount: 4,
         lastMessageAt: at(11),
         lastDirection: 'THEM',
         waitingSince: at(10),
         lastReplyAt: at(9),
      })
   })

   it('should not wait when the last message is ours, and keep our last reply', () => {
      expect(
         summaryOf([
            {
               direction: 'THEM',
               sentAt: at(8),
            },
            {
               direction: 'ME',
               sentAt: at(9),
            },
         ])
      ).toMatchObject({
         lastDirection: 'ME',
         waitingSince: null,
         lastReplyAt: at(9),
      })
   })

   it('should have no reply date when we never wrote', () => {
      expect(
         summaryOf([
            {
               direction: 'THEM',
               sentAt: at(8),
            },
         ])
      ).toMatchObject({
         waitingSince: at(8),
         lastReplyAt: null,
      })
   })
})
