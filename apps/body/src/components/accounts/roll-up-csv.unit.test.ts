import { describe, expect, it } from 'vitest'

import { type AccountBrowse } from '../browsing/types'

import { rollUpCsv } from './roll-up-csv'

const account = (patch: Partial<AccountBrowse>): AccountBrowse => ({
   accountId: 'a',
   email: 'a@example.com',
   clientLabel: 'Acme',
   mode: 'SAFE',
   usedSeconds: 21 * 60,
   state: 'OPEN',
   nextAt: null,
   hours: { days: [1], startMinute: 0, endMinute: 1440, timeZone: 'UTC' },
   proxyTimeZone: 'UTC',
   last30: [0, 600, 1260],
   idleWorkingDays: 0,
   overLimitDays14: 0,
   viewsLeft: null,
   ...patch,
})

describe('rollUpCsv', () => {
   it('should write one row per account with minutes today and on each day, oldest first', () => {
      expect(rollUpCsv([account({}), account({ email: 'b@example.com', clientLabel: null, last30: [60] })])).toBe(
         [
            'Account,Client,Daily limit,Minutes today,2 days ago,1 day ago,Today',
            'a@example.com,Acme,Safe,21,0,10,21',
            'b@example.com,,Safe,21,1,0,0',
         ].join('\r\n')
      )
   })

   it('should keep a client name that would run as a formula as text', () => {
      expect(rollUpCsv([account({ clientLabel: '=SUM(A1)' })])).toContain("'=SUM(A1)")
   })

   it('should write only the header for no accounts', () => {
      expect(rollUpCsv([])).toBe('Account,Client,Daily limit,Minutes today')
   })
})
