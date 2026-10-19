import { describe, expect, it } from 'vitest'

import { nextVisitNote, visitBlocker, visitRunning } from './visit'

describe('visitBlocker', () => {
   it('should let a signed in account with a working proxy visit', () => {
      expect(visitBlocker('ACTIVE', true)).toBeUndefined()
      expect(visitBlocker('ACTIVE', undefined)).toBeUndefined()
   })

   it('should say a paused account has to be resumed first', () => {
      expect(visitBlocker('DISABLED', true)).toBe('Resume the account before a visit.')
   })

   it('should send an account that is not signed in to the login test', () => {
      for (const status of ['PENDING', 'NEEDS_REAUTH', 'ERROR', 'BLOCKED'] as const) {
         expect(visitBlocker(status, true)).toBe('The visit needs an account that is signed in. Run Test login first.')
      }
   })

   it('should say a working proxy is needed', () => {
      expect(visitBlocker('ACTIVE', false)).toBe('Add a proxy that works first: visits never go out directly.')
   })
})

describe('nextVisitNote', () => {
   it('should give no note when a time is planned', () => {
      expect(nextVisitNote('ACTIVE', '2026-10-20T08:00:00Z')).toBeUndefined()
   })

   it('should say soon while the daily job has not drawn a time yet', () => {
      expect(nextVisitNote('ACTIVE', null)).toBe('Soon')
   })

   it('should say why nothing is planned for a paused or signed out account', () => {
      expect(nextVisitNote('DISABLED', '2026-10-20T08:00:00Z')).toBe('Paused')
      expect(nextVisitNote('ERROR', '2026-10-20T08:00:00Z')).toBe('After the account signs in')
   })
})

describe('visitRunning', () => {
   it('should be true only while the newest visit is in progress', () => {
      expect(visitRunning({ lastVisit: { status: 'IN_PROGRESS' } })).toBe(true)
      expect(visitRunning({ lastVisit: { status: 'SUCCEEDED' } })).toBe(false)
      expect(visitRunning({ lastVisit: null })).toBe(false)
   })
})
