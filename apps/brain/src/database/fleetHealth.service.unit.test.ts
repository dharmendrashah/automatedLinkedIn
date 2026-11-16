import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FleetHealthService } from './fleetHealth.service'

const mocks = vi.hoisted(() => ({
   findAccounts: vi.fn(),
   inviteGroupBy: vi.fn(),
   actGroupBy: vi.fn(),
   forAccounts: vi.fn(),
}))

vi.mock('./accountRoom.service', () => ({ AccountRoomService: { forAccounts: mocks.forAccounts } }))
vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInAccount: { findMany: mocks.findAccounts },
         linkedInInvite: { groupBy: mocks.inviteGroupBy },
         postAct: { groupBy: mocks.actGroupBy },
      },
   },
}))

const NOW = new Date('2026-11-15T12:00:00Z')
const HOUR_MS = 60 * 60 * 1000
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS)
const ahead = (hours: number) => new Date(NOW.getTime() + hours * HOUR_MS)

const account = (patch: Record<string, unknown> = {}) => ({
   id: 'a1',
   email: 'one@example.com',
   displayName: null,
   status: 'ACTIVE',
   createdAt: ago(1000),
   statusUpdatedAt: ago(500),
   lastVerifiedAt: null,
   invitesStoppedAt: null,
   invitesStopUntil: null,
   engageStoppedAt: null,
   engageStopUntil: null,
   ...patch,
})

const only = async (patch: Record<string, unknown> = {}) => {
   mocks.findAccounts.mockResolvedValueOnce([account(patch)])
   const [row] = await FleetHealthService.forUser('u1', NOW)

   return row
}

const count = (accountId: string, all: number) => [
   {
      accountId,
      _count: { _all: all },
   },
]

describe('FleetHealthService.forUser', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.forAccounts.mockResolvedValue(new Map())
      mocks.inviteGroupBy.mockResolvedValue([])
      mocks.actGroupBy.mockResolvedValue([])
   })

   it('should carry the account facts and the 14-day invite counts the page needs', async () => {
      // The invite groupBys run in this order: 14 days, 14 days accepted, the 14 before, those accepted, unclear in a day.
      mocks.inviteGroupBy
         .mockResolvedValueOnce(count('a1', 30))
         .mockResolvedValueOnce(count('a1', 12))
         .mockResolvedValue([])

      const row = await only({
         displayName: 'Ada',
         status: 'NEEDS_REAUTH',
      })

      expect(row).toMatchObject({
         accountId: 'a1',
         name: 'Ada',
         email: 'one@example.com',
         status: 'NEEDS_REAUTH',
         createdAt: ago(1000),
         statusUpdatedAt: ago(500),
         invitedLast14: 30,
         acceptedLast14: 12,
      })
   })

   it('should have no stop for an account that was never stopped', async () => {
      expect(await only()).toMatchObject({
         invitesStopped: false,
         engageStopped: false,
         stopOpenEnded: false,
         stopUntil: null,
         stopAt: null,
         invitedLast14: 0,
         acceptedLast14: 0,
      })
   })

   it('should read a timed invites stop', async () => {
      expect(
         await only({
            invitesStoppedAt: ago(2),
            invitesStopUntil: ahead(3),
         })
      ).toMatchObject({
         invitesStopped: true,
         engageStopped: false,
         stopOpenEnded: false,
         stopUntil: ahead(3),
         stopAt: ago(2),
      })
   })

   it('should read an open-ended engagement stop, which does not stop invites', async () => {
      expect(await only({ engageStoppedAt: ago(5) })).toMatchObject({
         invitesStopped: false,
         engageStopped: true,
         stopOpenEnded: true,
         stopUntil: null,
         stopAt: ago(5),
      })
   })

   it('should end an open-ended stop at the next sign-in', async () => {
      expect(
         await only({
            invitesStoppedAt: ago(5),
            lastVerifiedAt: ago(1),
         })
      ).toMatchObject({
         invitesStopped: false,
         stopOpenEnded: false,
         stopUntil: null,
         stopAt: null,
      })
   })

   it('should ignore a stop whose time has passed', async () => {
      expect(
         await only({
            invitesStoppedAt: ago(10),
            invitesStopUntil: ago(1),
         })
      ).toMatchObject({
         invitesStopped: false,
         stopOpenEnded: false,
         stopUntil: null,
         stopAt: null,
      })
   })

   it('should take the latest end and start of two timed stops', async () => {
      expect(
         await only({
            invitesStoppedAt: ago(4),
            invitesStopUntil: ahead(2),
            engageStoppedAt: ago(1),
            engageStopUntil: ahead(6),
         })
      ).toMatchObject({
         invitesStopped: true,
         engageStopped: true,
         stopOpenEnded: false,
         stopUntil: ahead(6),
         stopAt: ago(1),
      })
   })

   it('should let an open-ended stop win over a timed one, and keep an expired one out', async () => {
      expect(
         await only({
            invitesStoppedAt: ago(4),
            invitesStopUntil: ahead(2),
            engageStoppedAt: ago(3),
         })
      ).toMatchObject({
         stopOpenEnded: true,
         stopUntil: null,
         stopAt: ago(3),
      })
      expect(
         await only({
            invitesStoppedAt: ago(1),
            invitesStopUntil: ago(0.5),
            engageStoppedAt: ago(8),
            engageStopUntil: ahead(1),
         })
      ).toMatchObject({
         invitesStopped: false,
         engageStopped: true,
         stopUntil: ahead(1),
         stopAt: ago(8),
      })
   })
})
