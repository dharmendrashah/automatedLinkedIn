import { describe, expect, it } from 'vitest'

import { type ItemState } from './today'
import { todayCsv } from './today-csv'

const state = (patch: Partial<ItemState>): ItemState => ({
   item: 'visit',
   kind: 'DONE',
   tone: 'ok',
   text: 'Visit 02:40',
   detail: '',
   last: '02:40',
   result: 'Visited',
   resultTone: 'success',
   runId: 's1',
   lastOkText: null,
   lastOkId: null,
   next: 'tomorrow 02:55',
   at: null,
   ...patch,
})

describe('todayCsv', () => {
   it('should write one row per account and item with the state, the last run and the next time', () => {
      expect(
         todayCsv([
            {
               email: 'a@example.com',
               states: [
                  state({}),
                  state({ item: 'network', kind: 'PENDING', last: null, result: null, next: 'today 19:30' }),
               ],
            },
         ])
      ).toBe(
         [
            'Account,Item,State,Last run,Last result,Next',
            'a@example.com,Daily visit,Done,02:40,Visited,tomorrow 02:55',
            'a@example.com,Check my network,Pending today,,,today 19:30',
         ].join('\r\n')
      )
   })

   it('should keep an email that would run as a formula as text, and write only the header for no accounts', () => {
      expect(todayCsv([{ email: '=SUM(A1)', states: [state({})] }])).toContain("'=SUM(A1)")
      expect(todayCsv([])).toBe('Account,Item,State,Last run,Last result,Next')
   })
})
