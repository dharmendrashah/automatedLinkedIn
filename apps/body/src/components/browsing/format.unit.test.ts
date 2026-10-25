import { describe, expect, it } from 'vitest'

import { type WorkingHours } from './types'

import { clock, formatMinutes, hoursProblem, hoursText, meterText, spreadSentence, stateText } from './format'

const office: WorkingHours = {
   days: [1, 2, 3, 4, 5],
   startMinute: 9 * 60,
   endMinute: 18 * 60,
   timeZone: 'Asia/Kolkata',
}

describe('formatMinutes', () => {
   it('should say minutes, then hours and minutes, and never show a tiny session as zero', () => {
      expect(formatMinutes(0)).toBe('0 min')
      expect(formatMinutes(20)).toBe('less than 1 min')
      expect(formatMinutes(42 * 60)).toBe('42 min')
      expect(formatMinutes(72 * 60)).toBe('1 h 12 min')
      expect(formatMinutes(120 * 60)).toBe('2 h')
   })

   it('should write the meter as used of limit', () => {
      expect(meterText(42 * 60, 90 * 60)).toBe('42 of 90 min')
   })

   it('should write a clock time with two digits', () => {
      expect(clock(9 * 60)).toBe('09:00')
      expect(clock(18 * 60 + 5)).toBe('18:05')
   })
})

describe('hoursText and spreadSentence', () => {
   it('should read days as a range, a list or every day', () => {
      expect(hoursText(office)).toBe('09:00 to 18:00, Mon to Fri, Asia/Kolkata')
      expect(hoursText({ ...office, days: [1, 3, 5] })).toBe('09:00 to 18:00, Mon, Wed and Fri, Asia/Kolkata')
      expect(hoursText({ ...office, days: [1, 2, 3, 4, 5, 6, 7] })).toBe('09:00 to 18:00, every day, Asia/Kolkata')
      expect(hoursText({ ...office, days: [1, 2, 3, 6, 7] })).toBe(
         '09:00 to 18:00, Mon to Wed, Sat and Sun, Asia/Kolkata'
      )
   })

   it('should say what the window means in minutes an hour for the mode', () => {
      expect(spreadSentence('SAFE', office)).toBe(
         'Spread evenly from 09:00 to 18:00, Monday to Friday (Asia/Kolkata): about 10 minutes an hour.'
      )
      expect(spreadSentence('AGGRESSIVE', office)).toContain('about 20 minutes an hour')
   })
})

describe('hoursProblem', () => {
   it('should accept hours long enough for the mode', () => {
      expect(hoursProblem('SAFE', office)).toBeUndefined()
      expect(hoursProblem('AGGRESSIVE', { ...office, startMinute: 8 * 60, endMinute: 11 * 60 })).toBeUndefined()
   })

   it('should say why hours cannot be saved', () => {
      expect(hoursProblem('SAFE', { ...office, days: [] })).toBe('Pick at least one working day.')
      expect(hoursProblem('SAFE', { ...office, startMinute: 600, endMinute: 600 })).toBe(
         'Working hours must end after they start.'
      )
      expect(hoursProblem('SAFE', { ...office, startMinute: 9 * 60, endMinute: 10 * 60 })).toBe(
         'Safe needs at least 1 h 30 min of working time.'
      )
   })
})

describe('stateText', () => {
   it('should say what the account can do now, with the time it resumes', () => {
      expect(stateText({ state: 'OPEN', nextAt: null })).toBe('Open. A session can start now.')
      expect(stateText({ state: 'WAITING_FOR_SLOT', nextAt: '14:20' })).toBe('Open. The next session starts at 14:20.')
      expect(stateText({ state: 'DAY_FULL', nextAt: 'tomorrow at 09:00' })).toBe(
         "Today's limit is used. Browsing resumes tomorrow at 09:00."
      )
      expect(stateText({ state: 'OUTSIDE_HOURS', nextAt: '09:00' })).toBe(
         'Outside working hours. Browsing resumes 09:00.'
      )
      expect(stateText({ state: 'NOT_BROWSING', nextAt: null })).toContain('Not browsing')
   })
})
