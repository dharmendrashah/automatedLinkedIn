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
      expect(lines[1].endsWith('"2"')).toBe(true)
      expect(lines[2]).toContain('"Company","Acme"')
      expect(lines[3]).toBe('"Cut at 2 of 3 rows."')
   })
})
