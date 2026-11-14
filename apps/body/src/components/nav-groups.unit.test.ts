import { describe, expect, it } from 'vitest'

import { groupsFor } from './nav-groups'

const routes = (options: Parameters<typeof groupsFor>[0]) =>
   groupsFor(options).flatMap(group => group.items.map(item => item.to))

describe('groupsFor', () => {
   it('shows the cron monitor to the admin only, just before Profile', () => {
      expect(routes({ admin: false })).not.toContain('/jobs')

      const admin = routes({ admin: true })

      expect(admin.indexOf('/jobs')).toBe(admin.indexOf('/profile') - 1)
   })

   it('lists every page once, whoever looks', () => {
      for (const admin of [false, true]) {
         const all = routes({ admin })

         expect(new Set(all).size).toBe(all.length)
      }
   })

   it('puts the approvals count on To approve and nowhere else', () => {
      const items = groupsFor({ admin: false, waiting: 3 }).flatMap(group => group.items)

      expect(items.filter(item => item.badge).map(item => item.to)).toEqual(['/approve'])
      expect(items.find(item => item.to === '/approve')?.badge).toBe(3)
   })
})
