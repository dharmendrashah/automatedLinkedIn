import { describe, expect, it } from 'vitest'

import { type Loading, readyCounts, readyLine, toneOf } from './loading'

const loading = (percent: number, states: string[] = [], conversations = 0): Loading => ({
   percent,
   conversations,
   readyForWorkflows: false,
   readyForUnibox: false,
   steps: (['SIGN_IN', 'PROFILE', 'CONNECTIONS', 'REQUESTS', 'MESSAGES'] as const).map((step, index) => ({
      step,
      weight: [10, 10, 20, 20, 40][index] ?? 0,
      state: (states[index] ?? 'WAITING') as Loading['steps'][number]['state'],
   })),
})

describe('toneOf', () => {
   it('should go from light red through light grey, yellow and blue to green', () => {
      expect([0, 19, 20, 39, 40, 59, 60, 99, 100].map(toneOf)).toEqual([
         'RED',
         'RED',
         'GREY',
         'GREY',
         'YELLOW',
         'YELLOW',
         'BLUE',
         'BLUE',
         'GREEN',
      ])
   })
})

describe('readyLine', () => {
   it('should say what is read now, what did not finish, and how far the messages are, in that order', () => {
      expect(readyLine(loading(30, ['DONE', 'DONE', 'READING']), 'ACTIVE')).toBe('Reading your connections now.')
      expect(readyLine(loading(30, ['DONE', 'NOT_FINISHED']), 'ACTIVE')).toBe(
         'Your profile did not finish. It is tried again tomorrow.'
      )
      expect(readyLine(loading(30, ['DONE', 'GIVEN_UP']), 'ACTIVE')).toBe(
         'Your profile could not be read. Press Read profile on the account page.'
      )
      expect(readyLine(loading(75, ['DONE', 'DONE', 'DONE', 'DONE', 'WAITING'], 340), 'ACTIVE')).toBe(
         'Messages: 340 conversations read so far. A large inbox takes a few days.'
      )
      expect(readyLine(loading(0), 'PENDING')).toBe('Starts after the first good sign-in.')
      expect(readyLine(loading(10, ['DONE']), 'ACTIVE')).toBe('Your profile is next. It starts by itself.')
   })

   it('should say it waits for the account when the account has a problem, whatever is read', () => {
      expect(readyLine(loading(50, ['DONE', 'DONE', 'READING']), 'NEEDS_REAUTH')).toBe(
         'Waits until the account is signed in again.'
      )
      expect(readyLine(loading(50), 'DISABLED')).toBe('Waits while the account is paused.')
   })
})

describe('readyCounts', () => {
   it('should count accounts ready, getting ready and needing the owner', () => {
      expect(
         readyCounts([
            { status: 'ACTIVE', loading: loading(100) },
            { status: 'ACTIVE', loading: loading(40) },
            { status: 'NEEDS_REAUTH', loading: loading(40) },
            { status: 'ACTIVE', loading: loading(30, ['DONE', 'GIVEN_UP']) },
            { status: 'ACTIVE', loading: null },
         ])
      ).toEqual({
         ready: 1,
         loading: 1,
         needsYou: 2,
      })
   })
})
