import { describe, expect, it } from 'vitest'

import { type ProfileStateLike, noticeOf, viewOf } from './view'

const state = (over: Partial<ProfileStateLike> = {}): ProfileStateLike => ({
   phase: 'NEVER',
   firstVisit: false,
   blocker: null,
   lastRun: null,
   ...over,
})

describe('viewOf', () => {
   it('should wait for the state, and for the profile once the state says one is stored', () => {
      expect(viewOf(undefined, false, false)).toBe('LOADING')
      expect(viewOf(state({ phase: 'READY' }), false, true)).toBe('LOADING')
   })

   it('should show the profile whenever there is one, even while a new read goes on or the last one failed', () => {
      expect(viewOf(state({ phase: 'READY' }), true, false)).toBe('PROFILE')
      expect(viewOf(state({ phase: 'READING' }), true, false)).toBe('PROFILE')
      expect(viewOf(state({ phase: 'READY', lastRun: { ok: false, message: 'x', finishedAt: null } }), true, false)).toBe(
         'PROFILE'
      )
   })

   it('should say reading, failed or empty when there is no profile to show', () => {
      expect(viewOf(state({ phase: 'READING' }), false, false)).toBe('READING')
      expect(viewOf(state({ phase: 'FAILED' }), false, false)).toBe('FAILED')
      expect(viewOf(state({ phase: 'NEVER' }), false, false)).toBe('EMPTY')
   })
})

describe('noticeOf', () => {
   it('should say the first read is starting when it can, and why it cannot when it cannot', () => {
      expect(noticeOf(state({ firstVisit: true }))).toBe('Starting the first read of this profile.')
      expect(noticeOf(state({ firstVisit: true, blocker: 'Run Test login first.' }))).toBe('Run Test login first.')
   })

   it('should invite a read for an account that was asked before, unless something blocks it', () => {
      expect(noticeOf(state())).toBe('This profile has not been read yet. Use Read profile to read it.')
      expect(noticeOf(state({ blocker: 'Add a proxy that works first.' }))).toBe('Add a proxy that works first.')
   })

   it('should give the sentence of a run that failed', () => {
      expect(noticeOf(state({ phase: 'FAILED', lastRun: { ok: false, message: 'LinkedIn asked for a sign-in.', finishedAt: null } }))).toBe(
         'The last read did not give a profile: LinkedIn asked for a sign-in.'
      )
   })
})
