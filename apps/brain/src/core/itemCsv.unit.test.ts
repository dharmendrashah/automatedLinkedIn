import { describe, expect, it, vi } from 'vitest'

import { itemsCsv } from './itemCsv'
import { person } from './workflowItem'

vi.mock('env', () => ({}))

describe('itemsCsv', () => {
   it('should write people, posts and companies in shared columns, with the round, and say when it was cut', () => {
      const csv = itemsCsv(
         [
            {
               round: 1,
               item: person({
                  slug: 'ada',
                  url: 'https://www.linkedin.com/in/ada',
                  name: '=cmd',
                  tags: ['hot'],
                  signals: [
                     {
                        type: 'commented',
                        via: 'https://post',
                        at: null,
                        excerpt: null,
                     },
                  ],
               }),
            },
            {
               round: 0,
               item: {
                  kind: 'company',
                  slug: 'acme',
                  url: 'https://www.linkedin.com/company/acme',
                  name: 'Acme',
                  hiring: ['SDR'],
               },
            },
         ],
         3
      )
      const lines = csv.split('\r\n')

      expect(lines[1]).toContain('"Person","\'=cmd"')
      expect(lines[1]).toContain('"hot","Commented","https://post"')
      expect(lines[1]).toContain('"2"')
      expect(lines[2]).toContain('"Company","Acme"')
      expect(lines[3]).toBe('"Cut at 2 of 3 rows."')
   })

   it('should write what a block did with an item, and a conversation with its last words', () => {
      const csv = itemsCsv(
         [
            {
               round: 0,
               item: {
                  ...person({
                     slug: 'ada',
                     url: 'https://www.linkedin.com/in/ada',
                  }),
                  result: {
                     action: 'visitProfile',
                     status: 'FAILED',
                     account: null,
                     at: null,
                     reason: 'No account could take it.',
                  },
               },
            },
            {
               round: 0,
               item: {
                  kind: 'conversation',
                  slug: 'thread-1',
                  url: 'https://www.linkedin.com/messaging/thread/thread-1/',
                  personSlug: 'ada',
                  name: 'Ada',
                  headline: null,
                  lastText: 'Thanks',
                  lastAt: '2026-11-02T10:00:00Z',
                  lastFrom: 'THEM',
                  unread: true,
               },
            },
         ],
         2
      )
      const lines = csv.split('\r\n')

      expect(lines[0]?.endsWith('"Result"')).toBe(true)
      expect(lines[1]?.endsWith('"FAILED: No account could take it."')).toBe(true)
      expect(lines[2]).toContain('"Conversation","Ada"')
      expect(lines[2]).toContain('They wrote last: Thanks')
   })
})
