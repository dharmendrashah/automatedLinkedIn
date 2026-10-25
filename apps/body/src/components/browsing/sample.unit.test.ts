import { describe, expect, it } from 'vitest'

import { buildBrowse, dayOf, sampleDays, sampleKindOf, sampleMix, sampleSessions } from './sample'

// A Wednesday at 14:00, inside office hours.
const now = new Date(2026, 9, 21, 14, 0)
const account = {
   id: 'account-1',
   email: 'a@example.com',
   status: 'ACTIVE' as const,
}

describe('sample browsing data', () => {
   it('should be the same on every visit and different for another account', () => {
      expect(sampleDays('busy', 'a', now)).toEqual(sampleDays('busy', 'a', now))
      expect(sampleDays('busy', 'a', now)).not.toEqual(sampleDays('busy', 'b', now))
   })

   it('should have nothing for empty, little for sparse, and days over the limit for over', () => {
      expect(sampleDays('empty', 'a', now)).toEqual([])
      expect(sampleDays('sparse', 'a', now).length).toBeLessThan(sampleDays('busy', 'a', now).length)
      expect(sampleDays('over', 'a', now).some(({ seconds, limitSeconds }) => seconds > limitSeconds)).toBe(true)
      expect(sampleDays('busy', 'a', now).some(({ seconds, limitSeconds }) => seconds > limitSeconds)).toBe(false)
   })

   it('should take today’s use in the account from the same days the heatmap shows', () => {
      const days = sampleDays('busy', account.id, now)
      const today = days.find(({ day }) => day === dayOf(now))

      expect(buildBrowse('busy', account, now).usedSeconds).toBe(today?.seconds ?? 0)
      expect(buildBrowse('busy', account, now).last30).toHaveLength(30)
   })

   it('should not browse when the account is not active, and follow a change of mode', () => {
      expect(buildBrowse('busy', { ...account, status: 'DISABLED' }, now)).toMatchObject({
         state: 'NOT_BROWSING',
         viewsLeft: null,
      })
      expect(buildBrowse('busy', account, now, { mode: 'AGGRESSIVE' }).mode).toBe('AGGRESSIVE')
      expect(buildBrowse('busy', account, now, { clientLabel: null }).clientLabel).toBeNull()
   })

   it('should close the day for an account whose use reached its limit, and open it again with a higher mode', () => {
      const id = Array.from({ length: 40 }, (_, index) => `full-${index}`).find(
         candidate => buildBrowse('busy', { ...account, id: candidate }, now).state === 'DAY_FULL'
      )

      expect(id).toBeDefined()

      const full = { ...account, id: id ?? '' }
      const { mode } = buildBrowse('busy', full, now)

      if (mode !== 'AGGRESSIVE') {
         expect(buildBrowse('busy', full, now, { mode: 'AGGRESSIVE' }).state).not.toBe('DAY_FULL')
      }
   })

   it('should split a day into its sessions and today into where the time went', () => {
      const day = {
         day: '2026-10-20',
         seconds: 3600,
         sessions: 6,
         limitSeconds: 5400,
      }

      expect(sampleSessions('a', day)).toHaveLength(6)
      expect(sampleSessions('a', day).reduce((sum, { seconds }) => sum + seconds, 0)).toBe(3600)
      expect(sampleMix(1000).reduce((sum, { seconds }) => sum + seconds, 0)).toBe(1000)
      expect(sampleMix(0)).toEqual([])
   })

   it('should read the sample kind from the address', () => {
      expect(sampleKindOf('over')).toBe('over')
      expect(sampleKindOf('nope')).toBeNull()
      expect(sampleKindOf(null)).toBeNull()
   })
})
