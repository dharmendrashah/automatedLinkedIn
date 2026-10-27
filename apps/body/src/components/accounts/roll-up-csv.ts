import { type AccountBrowse } from '../browsing/types'

import { modeOf } from '../browsing/modes'
import { cell } from '../posting/posts-csv'

const minutes = (seconds: number) => String(Math.round(seconds / 60))

const agoText = (days: number) => (days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'} ago`)

// The client roll-up as a spreadsheet: one row per account, minutes today and on each of the last 30 days. Built in the browser; a
// cell that would run as a formula is kept as text by `cell`.
export const rollUpCsv = (accounts: AccountBrowse[]) => {
   const days = Math.max(0, ...accounts.map(({ last30 }) => last30.length))
   const header = [
      'Account',
      'Client',
      'Daily limit',
      'Minutes today',
      ...Array.from({ length: days }, (_, index) => agoText(days - 1 - index)),
   ]

   return [
      header,
      ...accounts.map(account => [
         account.email,
         account.clientLabel ?? '',
         modeOf(account.mode).label,
         minutes(account.usedSeconds),
         ...Array.from({ length: days }, (_, index) => minutes(account.last30[index] ?? 0)),
      ]),
   ]
      .map(line => line.map(cell).join(','))
      .join('\r\n')
}
