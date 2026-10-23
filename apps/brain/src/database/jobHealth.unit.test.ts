import { describe, expect, it } from 'vitest'

import { cleanError, everyWords, jobHealth, messageReadState } from './jobHealth'

const NOW = new Date('2026-10-24T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)

describe('jobHealth', () => {
   const every = 10 * 60_000

   it('should be unknown for a job that never ran', () => {
      expect(jobHealth(every, null, NOW)).toBe('UNKNOWN')
   })

   it('should be healthy for a recent good run, idle or not', () => {
      expect(
         jobHealth(
            every,
            {
               finishedAt: ago(5 * 60_000),
               outcome: 'IDLE',
            },
            NOW
         )
      ).toBe('HEALTHY')
      expect(
         jobHealth(
            every,
            {
               finishedAt: ago(5 * 60_000),
               outcome: 'WORKED',
            },
            NOW
         )
      ).toBe('HEALTHY')
   })

   it('should be late once two intervals and the grace have passed', () => {
      expect(
         jobHealth(
            every,
            {
               finishedAt: ago(20 * 60_000 + 30_000),
               outcome: 'WORKED',
            },
            NOW
         )
      ).toBe('HEALTHY')
      expect(
         jobHealth(
            every,
            {
               finishedAt: ago(20 * 60_000 + 30_001),
               outcome: 'WORKED',
            },
            NOW
         )
      ).toBe('LATE')
   })

   it('should be failing when the newest run failed or timed out', () => {
      expect(
         jobHealth(
            every,
            {
               finishedAt: ago(60_000),
               outcome: 'FAILED',
            },
            NOW
         )
      ).toBe('FAILING')
      expect(
         jobHealth(
            every,
            {
               finishedAt: ago(60_000),
               outcome: 'TIMED_OUT',
            },
            NOW
         )
      ).toBe('FAILING')
   })

   it('should call a job late before failing when it stopped running', () => {
      expect(
         jobHealth(
            every,
            {
               finishedAt: ago(3 * every),
               outcome: 'FAILED',
            },
            NOW
         )
      ).toBe('LATE')
   })
})

describe('messageReadState', () => {
   it('should not schedule an account that is not active', () => {
      expect(
         messageReadState(
            {
               status: 'PENDING',
               nextMessagesAt: ago(0),
            },
            NOW
         )
      ).toBe('NOT_SCHEDULED')
   })

   it('should wait for the first time to be drawn', () => {
      expect(
         messageReadState(
            {
               status: 'ACTIVE',
               nextMessagesAt: null,
            },
            NOW
         )
      ).toBe('WAITING')
   })

   it('should be on time before and shortly after the due time, and overdue past 30 minutes', () => {
      expect(
         messageReadState(
            {
               status: 'ACTIVE',
               nextMessagesAt: new Date(NOW.getTime() + 60_000),
            },
            NOW
         )
      ).toBe('ON_TIME')
      expect(
         messageReadState(
            {
               status: 'ACTIVE',
               nextMessagesAt: ago(30 * 60_000),
            },
            NOW
         )
      ).toBe('ON_TIME')
      expect(
         messageReadState(
            {
               status: 'ACTIVE',
               nextMessagesAt: ago(30 * 60_000 + 1),
            },
            NOW
         )
      ).toBe('OVERDUE')
   })
})

describe('everyWords', () => {
   it('should use the largest unit that divides the interval', () => {
      expect(everyWords(5000)).toBe('every 5 seconds')
      expect(everyWords(1000)).toBe('every second')
      expect(everyWords(600_000)).toBe('every 10 minutes')
      expect(everyWords(3_600_000)).toBe('every hour')
      expect(everyWords(6 * 3_600_000)).toBe('every 6 hours')
      expect(everyWords(90_000)).toBe('every 90 seconds')
   })
})

describe('cleanError', () => {
   it('should mask credentials in an address, bearer tokens and long token-like strings', () => {
      const text = cleanError(
         new Error(
            'connect failed amqp://user:secret@rabbit:5672/x with Bearer abc.def.ghi and key tok_0123456789abcdef0123456789abcdef'
         )
      )

      expect(text).not.toContain('secret')
      expect(text).not.toContain('abc.def.ghi')
      expect(text).not.toContain('0123456789abcdef0123456789abcdef')
      expect(text).toContain('amqp://***@rabbit')
   })

   it('should fold whitespace, cut at 300 characters and take a non-error value', () => {
      expect(cleanError('a\n  b')).toBe('a b')
      expect(cleanError('word '.repeat(100))).toHaveLength(300)
      expect(cleanError(42)).toBe('42')
   })

   it('should never include a stack', () => {
      const error = new Error('boom')

      expect(cleanError(error)).toBe('Error: boom')
   })
})
