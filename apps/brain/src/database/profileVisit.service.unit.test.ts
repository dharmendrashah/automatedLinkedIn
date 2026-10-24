import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileVisitService } from './profileVisit.service'
import { TaskRefusedError } from './taskErrors'

const mocks = vi.hoisted(() => ({
   findSaved: vi.fn(),
   findAccount: vi.fn(),
   findOwnProfile: vi.fn(),
   findVisit: vi.fn(),
   countVisits: vi.fn(),
   createVisit: vi.fn(),
   request: vi.fn(),
}))

vi.mock('./prisma.service', () => ({
   PrismaService: {
      client: {
         linkedInProfile: { findFirst: mocks.findSaved },
         linkedInAccount: { findFirst: mocks.findAccount },
         linkedInAccountProfile: { findFirst: mocks.findOwnProfile },
         linkedInProfileVisit: {
            findFirst: mocks.findVisit,
            count: mocks.countVisits,
            create: mocks.createVisit,
         },
      },
   },
}))

vi.mock('./task.service', () => ({ TaskService: { request: mocks.request } }))

vi.mock('core', async () => {
   const actual = await vi.importActual<{ parseLinkedInUrl: unknown }>('core/linkedInUrl')

   return { parseLinkedInUrl: actual.parseLinkedInUrl }
})

const NOW = new Date('2026-10-24T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

describe('ProfileVisitService.request', () => {
   beforeEach(() => {
      vi.useFakeTimers({ now: NOW })
      vi.resetAllMocks()
      mocks.findSaved.mockResolvedValue({
         id: 'p1',
         slug: 'ada-lovelace',
      })
      mocks.findAccount.mockResolvedValue({ id: 'acc1' })
      mocks.findOwnProfile.mockResolvedValue(null)
      mocks.findVisit.mockResolvedValue(null)
      mocks.countVisits.mockResolvedValue(0)
      mocks.request.mockResolvedValue({ id: 's1' })
   })

   it('should ask the task for a saved profile, with its address, and save the visit with the session', async () => {
      await expect(ProfileVisitService.request('u1', 'acc1', { profileId: 'p1' })).resolves.toEqual({ id: 's1' })

      expect(mocks.findSaved).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               id: 'p1',
               userId: 'u1',
               archivedAt: null,
            },
         })
      )

      const [[options]] = mocks.request.mock.calls

      expect(options).toMatchObject({
         userId: 'u1',
         task: 'linkedin-view-profile',
         accountId: 'acc1',
         trigger: 'manual',
         input: { profileUrl: 'https://www.linkedin.com/in/ada-lovelace/' },
      })

      const tx = { linkedInProfileVisit: { create: mocks.createVisit } }

      await options.onStart('s1', tx)

      expect(mocks.createVisit).toHaveBeenCalledWith({
         data: {
            userId: 'u1',
            accountId: 'acc1',
            profileId: 'p1',
            slug: 'ada-lovelace',
            sessionId: 's1',
         },
      })
   })

   it('should take a pasted link as it is, tie it to the saved profile of the same person when there is one, and pass on a confirmation', async () => {
      await ProfileVisitService.request('u1', 'acc1', { link: 'linkedin.com/in/Ada-Lovelace?trk=x' }, true)

      expect(mocks.findSaved).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               userId: 'u1',
               slug: 'ada-lovelace',
               archivedAt: null,
            },
         })
      )
      expect(mocks.request).toHaveBeenCalledWith(
         expect.objectContaining({
            confirmed: true,
            input: { profileUrl: 'https://www.linkedin.com/in/ada-lovelace/' },
         })
      )
   })

   it('should keep the visit without a saved profile for a pasted link of a person who is not saved', async () => {
      mocks.findSaved.mockResolvedValue(null)

      await ProfileVisitService.request('u1', 'acc1', { link: 'https://www.linkedin.com/in/grace-hopper/' })

      const [[options]] = mocks.request.mock.calls

      await options.onStart('s1', { linkedInProfileVisit: { create: mocks.createVisit } })

      expect(mocks.createVisit).toHaveBeenCalledWith({
         data: expect.objectContaining({
            profileId: null,
            slug: 'grace-hopper',
         }),
      })
   })

   it('should answer nothing for a profile or an account that is not the owner’s, and ask for nothing', async () => {
      mocks.findSaved.mockResolvedValueOnce(null)
      await expect(ProfileVisitService.request('u1', 'acc1', { profileId: 'p1' })).resolves.toBeNull()

      mocks.findAccount.mockResolvedValueOnce(null)
      await expect(ProfileVisitService.request('u1', 'acc1', { profileId: 'p1' })).resolves.toBeNull()

      expect(mocks.request).not.toHaveBeenCalled()
   })

   it('should refuse a link that is not a profile', async () => {
      await expect(
         ProfileVisitService.request('u1', 'acc1', { link: 'https://www.linkedin.com/company/sample/' })
      ).rejects.toThrow('That is not a link to a LinkedIn profile.')
      expect(mocks.request).not.toHaveBeenCalled()
   })

   it('should refuse the account’s own profile', async () => {
      mocks.findOwnProfile.mockResolvedValue({ data: { profileUrl: 'https://www.linkedin.com/in/Ada-Lovelace/' } })

      await expect(ProfileVisitService.request('u1', 'acc1', { profileId: 'p1' })).rejects.toThrow(
         'That is the profile of this account itself.'
      )
   })

   it('should refuse a person this account viewed within 30 days, counting only visits that were asked for or went through', async () => {
      mocks.findVisit.mockResolvedValue({ id: 'v1' })

      await expect(ProfileVisitService.request('u1', 'acc1', { profileId: 'p1' })).rejects.toThrow(
         'This account already viewed that profile in the last 30 days.'
      )
      expect(mocks.findVisit).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               accountId: 'acc1',
               slug: 'ada-lovelace',
               status: { in: ['ASKED', 'DONE'] },
               createdAt: { gte: new Date(NOW.getTime() - 30 * DAY) },
            },
         })
      )
   })

   it('should refuse a visit past 15 in 24 hours for the account, whatever came of the earlier ones', async () => {
      mocks.countVisits.mockResolvedValue(15)

      await expect(ProfileVisitService.request('u1', 'acc1', { profileId: 'p1' })).rejects.toThrow(
         'This account has reached its limit of 15 profile views in 24 hours.'
      )
      expect(mocks.countVisits).toHaveBeenCalledWith({
         where: {
            accountId: 'acc1',
            createdAt: { gte: new Date(NOW.getTime() - DAY) },
         },
      })

      mocks.countVisits.mockResolvedValue(14)
      await expect(ProfileVisitService.request('u1', 'acc1', { profileId: 'p1' })).resolves.toEqual({ id: 's1' })
   })

   it('should say a refusal in a way the owner can read', async () => {
      mocks.findVisit.mockResolvedValue({ id: 'v1' })

      await expect(ProfileVisitService.request('u1', 'acc1', { profileId: 'p1' })).rejects.toBeInstanceOf(
         TaskRefusedError
      )
   })
})
