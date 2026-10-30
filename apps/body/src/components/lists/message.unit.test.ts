import { describe, expect, it } from 'vitest'

import { messageFor, staleSignal, strongestSignal } from './message'

const NOW = new Date('2026-10-18T10:00:00Z')

const signal = (
   type: 'commented' | 'reacted' | 'employee' | 'hiring',
   at: string | null,
   excerpt: string | null = null
) => ({
   type,
   via: 'https://www.linkedin.com/posts/x',
   at,
   excerpt,
})

describe('messageFor', () => {
   it('should open from a comment without quoting it back', () => {
      const text = messageFor({
         name: 'Ada Lovelace',
         company: 'Engines',
         signals: [signal('reacted', null), signal('commented', '2026-10-16', 'Our pipeline is empty')],
      })

      expect(text).toBe(
         'Hi Ada, I saw your comment on a recent LinkedIn post and wanted to reach out. Would you be open to a quick chat?'
      )
      expect(text).not.toContain('pipeline')
   })

   it('should open from hiring, a reaction, or nothing at all', () => {
      expect(messageFor({ name: 'Bob', company: 'Acme', signals: [signal('hiring', null, 'SDR, AE')] })).toBe(
         'Hi Bob, I noticed Acme is hiring for SDR, AE. Would you be open to a quick chat?'
      )
      expect(messageFor({ name: null, company: null, signals: [signal('reacted', null)] })).toBe(
         'Hi there, I saw you engaged with a recent LinkedIn post and wanted to reach out. Would you be open to a quick chat?'
      )
      expect(messageFor({ name: 'Cy', company: null, signals: [] })).toBe(
         'Hi Cy, I came across your profile and wanted to reach out. Would you be open to a quick chat?'
      )
   })
})

describe('strongestSignal and staleSignal', () => {
   it('should prefer a comment, then the newest, and call it stale after 30 days', () => {
      const old = signal('commented', '2026-09-01')
      const recent = signal('commented', '2026-10-15')

      expect(strongestSignal([signal('reacted', '2026-10-17'), old, recent])).toBe(recent)
      expect(staleSignal([old], NOW)).toBe(true)
      expect(staleSignal([recent], NOW)).toBe(false)
      expect(staleSignal([signal('reacted', null)], NOW)).toBe(false)
   })
})
