import { describe, expect, it } from 'vitest'

import { HANDOFF_HEADER, appLink, daysSince, handoffCsv } from './handoff'

describe('appLink', () => {
   it('should open the person in the app, with no double slash and an encoded identifier', () => {
      expect(appLink('https://app.example.com/', 'ada-lovelace')).toBe(
         'https://app.example.com/network?open=ada-lovelace'
      )
      expect(appLink('https://app.example.com', 'a b&c')).toBe('https://app.example.com/network?open=a%20b%26c')
   })
})

describe('daysSince', () => {
   it('should count whole days, never below 0, and say nothing when there is no date', () => {
      const now = new Date('2026-11-10T12:00:00.000Z')

      expect(daysSince(new Date('2026-11-01T13:00:00.000Z'), now)).toBe(8)
      expect(daysSince(new Date('2026-11-11T00:00:00.000Z'), now)).toBe(0)
      expect(daysSince(null, now)).toBeNull()
   })
})

describe('handoffCsv', () => {
   it('should give one line per person with the hand-off columns, blank cells for what is not known, and no LinkedIn link', () => {
      const csv = handoffCsv('https://app.example.com', [
         {
            slug: 'ada',
            name: 'Ada Lovelace',
            title: 'CTO',
            company: 'Analytical Engines',
            domain: 'engines.example',
            email: 'ada@engines.example',
            invitedOn: new Date('2026-10-01T09:00:00.000Z'),
            acceptedOn: null,
            firstMessageOn: new Date('2026-10-03T09:00:00.000Z'),
            daysWaiting: 21,
            engagedWith: 'Commented',
            score: 72,
         },
         {
            slug: 'bob',
            name: null,
            title: null,
            company: null,
            domain: null,
            email: null,
            invitedOn: null,
            acceptedOn: null,
            firstMessageOn: null,
            daysWaiting: null,
            engagedWith: null,
            score: null,
         },
      ])
      const lines = csv.split('\r\n')
      const quoted = (cells: string[]) => cells.map(cell => `"${cell}"`).join(',')

      expect(lines[0]).toBe(quoted(HANDOFF_HEADER))
      expect(lines[1]).toBe(
         quoted([
            'https://app.example.com/network?open=ada',
            'Ada Lovelace',
            'CTO',
            'Analytical Engines',
            'engines.example',
            'ada@engines.example',
            '2026-10-01',
            '',
            '2026-10-03',
            '21',
            'Commented',
            '72',
         ])
      )
      expect(lines[2]).toBe(quoted(['https://app.example.com/network?open=bob', ...Array(11).fill('')]))
      expect(csv).not.toContain('linkedin.com')
   })
})
