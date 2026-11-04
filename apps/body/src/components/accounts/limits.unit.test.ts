import { describe, expect, it } from 'vitest'

import { type AccountRoom, limitLines, pendingLine, pendingNotice } from './limits'

const room = (count: number, level: AccountRoom['pending']['level']): AccountRoom => ({
   accountId: 'a1',
   invites: {
      limit: 15,
      used: 4,
   },
   invitesWeek: {
      limit: 71,
      used: 38,
   },
   firstMessages: {
      limit: 14,
      used: 1,
   },
   replies: {
      limit: 30,
      used: 2,
   },
   reactions: {
      limit: 44,
      used: 0,
   },
   comments: {
      limit: 15,
      used: 0,
   },
   pending: {
      count,
      share: count / 3000,
      level,
   },
})

describe('limitLines', () => {
   it('should show what each act may do today and what it did, never the share behind a limit', () => {
      expect(limitLines(room(10, 'ok'))).toEqual([
         {
            label: 'Connection requests',
            text: '4 of 15, this week 38 of 71',
         },
         {
            label: 'First messages',
            text: '1 of 14',
         },
         {
            label: 'Reactions',
            text: '0 of 44',
         },
         {
            label: 'Comments',
            text: '0 of 15',
         },
      ])
   })

   it('should not show more used than the limit', () => {
      const over = room(0, 'ok')

      over.invites.used = 20

      expect(limitLines(over)[0]?.text).toBe('15 of 15, this week 38 of 71')
   })
})

describe('pendingNotice', () => {
   it('should say nothing while the account is fine', () => {
      expect(pendingNotice('Sam', room(412, 'ok'))).toBeUndefined()
      expect(pendingLine(room(412, 'ok'))).toBe('412 (14 %)')
   })

   it('should warn at 2,400 and say new invites are paused at 2,850', () => {
      expect(pendingNotice('Sam', room(2430, 'notice'))).toBe(
         'Sam has 2,430 pending invites (81 % of about 3,000). New invites will pause at 2,850.'
      )
      expect(pendingNotice('Sam', room(2850, 'paused'))).toBe('New invites for Sam are paused. Other accounts go on.')
   })
})
