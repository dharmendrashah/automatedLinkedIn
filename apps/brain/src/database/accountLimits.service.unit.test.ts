import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountLimitsService } from './accountLimits.service'
import { limitOf } from './limits'

const mocks = vi.hoisted(() => ({
   findMany: vi.fn(),
   officeOf: ({ officeTimeZone }: { officeTimeZone: string | null }) => ({ timeZone: officeTimeZone ?? 'UTC' }),
}))

vi.mock('./prisma.service', () => ({ PrismaService: { client: { linkedInAccount: { findMany: mocks.findMany } } } }))

// Only the office is needed; loading the whole budget service would validate the environment.
vi.mock('./browseBudget.service', () => ({ BrowseBudgetService: { officeOf: mocks.officeOf } }))

const NOW = new Date('2026-11-04T20:00:00Z')

const account = (id: string, officeTimeZone: string | null) => ({
   id,
   officeTimeZone,
   officeDays: 31,
   officeStartMinute: 540,
   officeEndMinute: 1080,
   proxyServers: [],
})

describe('AccountLimitsService', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should give each account its limits for the day of its own zone', async () => {
      mocks.findMany.mockResolvedValue([account('a1', 'Asia/Kolkata'), account('a2', null)])

      const limits = await AccountLimitsService.forAccounts(
         ['a1', 'a2', 'gone'],
         ['invitesPerDay', 'repliesPerDay'],
         NOW
      )

      expect(limits.get('a1')).toEqual({
         invitesPerDay: limitOf('invitesPerDay', 'a1', NOW, 'Asia/Kolkata'),
         repliesPerDay: limitOf('repliesPerDay', 'a1', NOW, 'Asia/Kolkata'),
      })
      expect(limits.get('a2')?.invitesPerDay).toBe(limitOf('invitesPerDay', 'a2', NOW, 'UTC'))
      expect(limits.has('gone')).toBe(false)
   })

   it('should answer undefined for an account that does not exist', async () => {
      mocks.findMany.mockResolvedValue([])

      await expect(AccountLimitsService.forAccount('gone', ['invitesPerDay'], NOW)).resolves.toBeUndefined()
   })
})
