import { describe, expect, it } from 'vitest'

import { type RunDetail } from './types'

import {
   actionLabel,
   countsText,
   gapText,
   hourState,
   hourTitle,
   itemResultLabel,
   summariseItems,
   whenText,
   workerBanner,
} from './describe'

const NOW = Date.parse('2026-10-24T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('whenText', () => {
   it.each([
      [2_000, 'just now'],
      [30_000, '30 seconds ago'],
      [60_000, '1 minute ago'],
      [10 * 60_000, '10 minutes ago'],
      [3 * 3_600_000, '3 hours ago'],
      [72 * 3_600_000, '3 days ago'],
   ])('should say how long ago a time was', (ms, text) => {
      expect(whenText(ago(ms), NOW)).toBe(text)
   })

   it('should say in how long a time that has not come will be', () => {
      expect(whenText(ago(-5 * 60_000), NOW)).toBe('in 5 minutes')
   })
})

describe('workerBanner', () => {
   it('should say the worker is running, and when a job last finished', () => {
      expect(workerBanner('RUNNING', ago(3000), NOW)).toEqual({
         tone: 'success',
         title: 'The brain worker is running. A job last finished just now.',
      })
   })

   it('should warn that nothing ran on time, and say since when', () => {
      expect(workerBanner('NOT_RUNNING', ago(2 * 3_600_000), NOW)).toMatchObject({
         tone: 'danger',
         title: expect.stringContaining('2 hours ago'),
      })
   })

   it('should not claim anything before a job has reported', () => {
      expect(workerBanner('UNKNOWN', null, NOW).tone).toBe('neutral')
   })
})

describe('hourState', () => {
   const hour = (worked: number, idle: number, failed: number) => ({
      at: ago(0),
      worked,
      idle,
      failed,
   })

   it('should show a failure first, then work, then idle, and a gap as none', () => {
      expect(hourState(hour(5, 5, 1))).toBe('failed')
      expect(hourState(hour(2, 5, 0))).toBe('worked')
      expect(hourState(hour(0, 5, 0))).toBe('idle')
      expect(hourState(hour(0, 0, 0))).toBe('none')
   })

   it('should say a gap is a missing run, with how often the job runs', () => {
      expect(hourTitle(hour(0, 0, 0), 'every 10 minutes')).toContain('no run recorded (the job runs every 10 minutes)')
      expect(hourTitle(hour(2, 3, 0), 'every 10 minutes')).toContain('2 did work, 3 nothing to do, 0 failed')
   })
})

describe('countsText', () => {
   it('should turn the counts of a run into words', () => {
      expect(countsText({ accountsDue: 5, reads: 3, timesDrawn: 1 })).toBe(
         '5 accounts due · 3 reads · 1 first times drawn'
      )
   })
})

describe('summariseItems', () => {
   const item = (action: string, result: RunDetail['items'][number]['result']) => ({
      id: Math.random().toString(),
      action,
      result,
      reason: null,
      user: null,
      account: null,
      session: null,
   })

   it('should answer for how many accounts a run asked, per action', () => {
      expect(
         summariseItems([
            item('messages-read', 'ASKED'),
            item('messages-read', 'ASKED'),
            item('messages-read', 'SKIPPED'),
            item('visit', 'FAILED'),
         ])
      ).toEqual([
         {
            action: 'messages-read',
            label: 'Message read',
            text: '2 asked for, 1 left',
         },
         {
            action: 'visit',
            label: 'Daily visit',
            text: '0 asked for, 0 left, 1 failed',
         },
      ])
   })
})

describe('labels', () => {
   it('should say scored, not asked for, when a proxy was scored', () => {
      expect(itemResultLabel('proxy-score', 'ASKED')).toBe('Scored')
      expect(itemResultLabel('messages-read', 'ASKED')).toBe('Asked for')
      expect(itemResultLabel('proxy-score', 'FAILED')).toBe('Failed')
      expect(
         summariseItems([
            {
               id: '1',
               action: 'proxy-score',
               result: 'ASKED',
               reason: null,
               user: null,
               account: null,
               session: null,
            },
         ])
      ).toEqual([
         {
            action: 'proxy-score',
            label: 'Proxy score',
            text: '1 scored, 0 left',
         },
      ])
   })

   it('should name the known actions and keep an unknown one as it is', () => {
      expect(actionLabel('sign-in-check')).toBe('Sign-in check')
      expect(actionLabel('something-new')).toBe('something-new')
   })

   it('should show the gap between two reads', () => {
      expect(gapText(null)).toBe('—')
      expect(gapText(45)).toBe('45 min')
      expect(gapText(121)).toBe('2 h 1 min')
   })
})
