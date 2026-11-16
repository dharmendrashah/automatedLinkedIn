import { describe, expect, it } from 'vitest'

import { accountRestOf, changeOf, dayLabel, formatWhen, plural } from './dashboard'

const change = (current: number, previous: number, total = current, hasCovered = true) =>
   changeOf({
      current,
      previous,
      total,
      hasCovered,
   })

describe('changeOf', () => {
   it('is new or none when no campaign is covered', () => {
      expect(change(0, 0, 5, false)).toEqual({ kind: 'new' })
      expect(change(0, 0, 0, false)).toEqual({ kind: 'none' })
   })

   it('is new when there was nothing before', () => {
      expect(change(5, 0)).toEqual({ kind: 'new' })
      expect(change(0, 0, 5)).toEqual({ kind: 'new' })
      expect(change(0, 0, 0)).toEqual({ kind: 'none' })
   })

   it('writes a percent with one decimal', () => {
      expect(change(120, 100)).toEqual({
         kind: 'percent',
         value: 20,
      })
      expect(change(80, 100)).toEqual({
         kind: 'percent',
         value: -20,
      })
      expect(change(8, 3)).toEqual({
         kind: 'percent',
         value: 166.7,
      })
      expect(change(1, 8)).toEqual({
         kind: 'percent',
         value: -87.5,
      })
      expect(change(201, 200)).toEqual({
         kind: 'percent',
         value: 0.5,
      })
   })

   it('is none when the value does not move or rounds to zero', () => {
      expect(change(100, 100)).toEqual({ kind: 'none' })
      expect(change(100001, 100000)).toEqual({ kind: 'none' })
   })
})

describe('accountRestOf', () => {
   it('lets an open-ended stop win', () => {
      expect(
         accountRestOf({
            stopped: false,
            openEnded: false,
         })
      ).toBe('none')
      expect(
         accountRestOf({
            stopped: true,
            openEnded: false,
         })
      ).toBe('timed')
      expect(
         accountRestOf({
            stopped: true,
            openEnded: true,
         })
      ).toBe('openEnded')
      expect(
         accountRestOf({
            stopped: false,
            openEnded: true,
         })
      ).toBe('none')
   })
})

describe('formatWhen', () => {
   const now = new Date('2026-11-15T12:00:00Z')

   it('writes only the time within 24 hours, past or future, 24 hours included', () => {
      expect(formatWhen('2026-11-15T09:05:00Z', now)).toBe('09:05 UTC')
      expect(formatWhen('2026-11-16T12:00:00Z', now)).toBe('12:00 UTC')
      expect(formatWhen(new Date('2026-11-14T12:00:00Z'), now)).toBe('12:00 UTC')
   })

   it('adds the day beyond 24 hours', () => {
      expect(formatWhen('2026-11-13T09:30:00Z', now)).toBe('13 Nov 09:30 UTC')
      expect(formatWhen('2026-12-02T00:00:00Z', now)).toBe('2 Dec 00:00 UTC')
   })

   it('writes the day alone', () => {
      expect(dayLabel('2026-11-13T23:59:00Z')).toBe('13 Nov')
   })
})

describe('plural', () => {
   it('picks the word by the count', () => {
      expect(plural(0, 'draft', 'drafts')).toBe('0 drafts')
      expect(plural(1, 'draft', 'drafts')).toBe('1 draft')
      expect(plural(2, 'draft', 'drafts')).toBe('2 drafts')
   })
})
