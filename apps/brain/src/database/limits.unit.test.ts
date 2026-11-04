import { describe, expect, it } from 'vitest'

import { LIMIT_SHARE, LIMIT_WINDOW, type LimitKind, PLATFORM_MAX } from '@automatedLinkedIn/contracts'

import { limitOf, limitWindowKey, pendingLevel } from './limits'

const KINDS = Object.keys(LIMIT_WINDOW) as LimitKind[]
const NOON = new Date('2026-11-04T12:00:00Z')

describe('pendingLevel', () => {
   it('should say ok under 2,400, notice from 2,400 and paused from 2,850', () => {
      expect(pendingLevel(0)).toBe('ok')
      expect(pendingLevel(2399)).toBe('ok')
      expect(pendingLevel(2400)).toBe('notice')
      expect(pendingLevel(2849)).toBe('notice')
      expect(pendingLevel(2850)).toBe('paused')
   })
})

describe('limitWindowKey', () => {
   it('should name the day in the account zone', () => {
      const late = new Date('2026-11-04T20:00:00Z')

      expect(limitWindowKey('day', late, 'UTC')).toBe('2026-11-04')
      expect(limitWindowKey('day', late, 'Asia/Kolkata')).toBe('2026-11-05')
   })

   it('should name the ISO week, including across a year', () => {
      expect(limitWindowKey('week', new Date('2026-01-01T12:00:00Z'), 'UTC')).toBe('2026-W01')
      expect(limitWindowKey('week', new Date('2025-12-29T12:00:00Z'), 'UTC')).toBe('2026-W01')
      expect(limitWindowKey('week', new Date('2026-12-31T12:00:00Z'), 'UTC')).toBe('2026-W53')
      expect(limitWindowKey('week', new Date('2026-11-08T12:00:00Z'), 'UTC')).toBe('2026-W45')
      expect(limitWindowKey('week', new Date('2026-11-09T12:00:00Z'), 'UTC')).toBe('2026-W46')
   })

   it('should name the month', () => {
      expect(limitWindowKey('month', new Date('2026-11-30T23:30:00Z'), 'UTC')).toBe('2026-11')
      expect(limitWindowKey('month', new Date('2026-11-30T23:30:00Z'), 'Asia/Kolkata')).toBe('2026-12')
   })
})

describe('limitOf', () => {
   it('should stay between 65 and 80 percent of the maximum, and at least 1', () => {
      for (const kind of KINDS) {
         const max = PLATFORM_MAX[kind]

         for (let index = 0; index < 300; index += 1) {
            const limit = limitOf(kind, `account-${index}`, NOON, 'UTC')

            expect(limit).toBeGreaterThanOrEqual(Math.max(1, Math.round(max * LIMIT_SHARE.min)))
            expect(limit).toBeLessThanOrEqual(Math.round(max * LIMIT_SHARE.max))
         }
      }
   })

   it('should give the documented ranges', () => {
      const seen = (kind: LimitKind) =>
         new Set(Array.from({ length: 2000 }, (_, index) => limitOf(kind, `a${index}`, NOON, 'UTC')))

      expect([Math.min(...seen('invitesPerDay')), Math.max(...seen('invitesPerDay'))]).toEqual([13, 16])
      expect([Math.min(...seen('reactionsPerDay')), Math.max(...seen('reactionsPerDay'))]).toEqual([39, 48])
      expect([Math.min(...seen('repliesPerDay')), Math.max(...seen('repliesPerDay'))]).toEqual([26, 32])
      expect([Math.min(...seen('notesPerMonth')), Math.max(...seen('notesPerMonth'))]).toEqual([3, 4])
   })

   it('should give the same number again for the same account, kind and window', () => {
      const first = limitOf('invitesPerDay', 'acc-1', NOON, 'UTC')

      expect(limitOf('invitesPerDay', 'acc-1', new Date('2026-11-04T01:00:00Z'), 'UTC')).toBe(first)
      expect(limitOf('invitesPerDay', 'acc-1', new Date('2026-11-04T23:59:00Z'), 'UTC')).toBe(first)
   })

   it('should differ between days, accounts and kinds', () => {
      const days = new Set(
         Array.from({ length: 30 }, (_, index) =>
            limitOf('reactionsPerDay', 'acc-1', new Date(Date.UTC(2026, 10, 1 + index, 12)), 'UTC')
         )
      )
      const accounts = new Set(
         Array.from({ length: 30 }, (_, index) => limitOf('reactionsPerDay', `acc-${index}`, NOON, 'UTC'))
      )

      expect(days.size).toBeGreaterThan(3)
      expect(accounts.size).toBeGreaterThan(3)
   })

   it('should average near 72.5 percent of the maximum over many accounts', () => {
      const total = Array.from({ length: 4000 }, (_, index) =>
         limitOf('reactionsPerDay', `acc-${index}`, NOON, 'UTC')
      ).reduce((sum, limit) => sum + limit, 0)
      const mean = total / 4000

      // Rounding keeps the mean at the middle of the range.
      expect(mean).toBeGreaterThan(PLATFORM_MAX.reactionsPerDay * 0.725 - 0.5)
      expect(mean).toBeLessThan(PLATFORM_MAX.reactionsPerDay * 0.725 + 0.5)
   })
})
