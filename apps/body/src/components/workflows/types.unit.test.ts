import { describe, expect, it } from 'vitest'

import { resumeText, stepLabel } from './types'

describe('resumeText', () => {
   const now = new Date('2026-11-01T10:00:00Z')

   it('should say when a step that is held back goes on, and nothing once that time has passed or when it is not held', () => {
      expect(resumeText('2026-11-09T14:30:00Z', now)).toMatch(/^Resumes /)
      expect(resumeText('2026-11-01T10:00:00Z', now)).toBeNull()
      expect(resumeText('2026-10-31T10:00:00Z', now)).toBeNull()
      expect(resumeText(null, now)).toBeNull()
   })

   it('should name the year only when it is not this one', () => {
      expect(resumeText('2026-12-09T14:30:00Z', now)).not.toContain('2026')
      expect(resumeText('2027-02-09T14:30:00Z', now)).toContain('2027')
   })
})

describe('stepLabel', () => {
   it('should say which try a step that a Retry ran again is on', () => {
      expect(
         stepLabel({
            status: 'DONE',
            progress: null,
            tries: 0,
         })
      ).toBe('Done')
      expect(
         stepLabel({
            status: 'DONE',
            progress: null,
            tries: 1,
         })
      ).toBe('Done (try 2)')
      expect(
         stepLabel({
            status: 'WAITING',
            progress: null,
            tries: 2,
         })
      ).toBe('Waiting (try 3)')
   })
})
