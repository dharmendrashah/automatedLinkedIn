import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PageVisitRefusedError, PageVisitService } from './pageVisit.service'
import { TaskRefusedError } from './taskErrors'

const mocks = vi.hoisted(() => ({
   findSaved: vi.fn(),
   findSavedCompany: vi.fn(),
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
         linkedInCompany: { findFirst: mocks.findSavedCompany },
         linkedInAccount: { findFirst: mocks.findAccount },
         linkedInAccountProfile: { findFirst: mocks.findOwnProfile },
         linkedInPageVisit: {
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

describe('PageVisitService.request', () => {
   beforeEach(() => {
      vi.useFakeTimers({ now: NOW })
      vi.resetAllMocks()
      mocks.findSaved.mockResolvedValue({
         id: 'p1',
         slug: 'ada-lovelace',
      })
      mocks.findSavedCompany.mockResolvedValue({
         id: 'c1',
         slug: 'analytical-engines',
      })
      mocks.findAccount.mockResolvedValue({ id: 'acc1' })
      mocks.findOwnProfile.mockResolvedValue(null)
      mocks.findVisit.mockResolvedValue(null)
      mocks.countVisits.mockResolvedValue(0)
      mocks.request.mockResolvedValue({ id: 's1' })
   })

   it('should ask the task for a saved profile, with its address, and save the visit with the session', async () => {
      await expect(PageVisitService.request('u1', 'acc1', { profileId: 'p1' })).resolves.toEqual({ id: 's1' })

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

      await options.onStart('s1', { linkedInPageVisit: { create: mocks.createVisit } })

      expect(mocks.createVisit).toHaveBeenCalledWith({
         data: {
            userId: 'u1',
            accountId: 'acc1',
            kind: 'PROFILE',
            profileId: 'p1',
            companyId: null,
            slug: 'ada-lovelace',
            sessionId: 's1',
         },
      })
   })

   it('should ask the company task for a saved company, with its address, and keep the visit under the company', async () => {
      await expect(PageVisitService.request('u1', 'acc1', { companyId: 'c1' })).resolves.toEqual({ id: 's1' })

      expect(mocks.findSavedCompany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               id: 'c1',
               userId: 'u1',
               archivedAt: null,
            },
         })
      )

      const [[options]] = mocks.request.mock.calls

      expect(options).toMatchObject({
         task: 'linkedin-view-company',
         input: { companyUrl: 'https://www.linkedin.com/company/analytical-engines/' },
      })

      await options.onStart('s1', { linkedInPageVisit: { create: mocks.createVisit } })

      expect(mocks.createVisit).toHaveBeenCalledWith({
         data: expect.objectContaining({
            kind: 'COMPANY',
            profileId: null,
            companyId: 'c1',
            slug: 'analytical-engines',
         }),
      })
   })

   it('should take a pasted company link, tie it to the saved company of the same name, and not look at the own-profile rule', async () => {
      await PageVisitService.request('u1', 'acc1', {
         kind: 'COMPANY',
         link: 'linkedin.com/company/Analytical-Engines?trk=x',
      })

      expect(mocks.findSavedCompany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               slug: 'analytical-engines',
               userId: 'u1',
               archivedAt: null,
            },
         })
      )
      expect(mocks.findOwnProfile).not.toHaveBeenCalled()
      expect(mocks.request).toHaveBeenCalledWith(
         expect.objectContaining({ input: { companyUrl: 'https://www.linkedin.com/company/analytical-engines/' } })
      )
   })

   it('should refuse a link that is not one of the kind asked for', async () => {
      await expect(
         PageVisitService.request('u1', 'acc1', {
            kind: 'PROFILE',
            link: 'https://www.linkedin.com/company/sample/',
         })
      ).rejects.toThrow('That is not a link to a LinkedIn profile.')
      await expect(
         PageVisitService.request('u1', 'acc1', {
            kind: 'COMPANY',
            link: 'https://www.linkedin.com/in/ada/',
         })
      ).rejects.toThrow('That is not a link to a LinkedIn company page.')
      expect(mocks.request).not.toHaveBeenCalled()
   })

   it('should count the cap across profiles and companies, and the repeat rule within one kind', async () => {
      mocks.countVisits.mockResolvedValue(15)
      await expect(PageVisitService.request('u1', 'acc1', { companyId: 'c1' })).rejects.toThrow(
         'This account has reached its limit of 15 page views in 24 hours.'
      )
      expect(mocks.countVisits.mock.calls[0]?.[0].where).not.toHaveProperty('kind')
      expect(mocks.countVisits).toHaveBeenCalledWith({
         where: {
            accountId: 'acc1',
            createdAt: { gte: new Date(NOW.getTime() - DAY) },
         },
      })

      mocks.countVisits.mockResolvedValue(14)
      await expect(PageVisitService.request('u1', 'acc1', { profileId: 'p1' })).resolves.toEqual({ id: 's1' })

      mocks.countVisits.mockResolvedValue(0)
      mocks.findVisit.mockResolvedValue({ id: 'v1' })
      await expect(PageVisitService.request('u1', 'acc1', { companyId: 'c1' })).rejects.toThrow(
         'This account already viewed that company page in the last 30 days.'
      )
      expect(mocks.findVisit).toHaveBeenLastCalledWith({
         where: {
            accountId: 'acc1',
            kind: 'COMPANY',
            slug: 'analytical-engines',
            status: { in: ['ASKED', 'DONE'] },
            createdAt: { gte: new Date(NOW.getTime() - 30 * DAY) },
         },
         select: { id: true },
      })
   })

   it('should take a pasted profile link, tie it to the saved profile of the same person, and pass on a confirmation', async () => {
      await PageVisitService.request(
         'u1',
         'acc1',
         {
            kind: 'PROFILE',
            link: 'linkedin.com/in/Ada-Lovelace?trk=x',
         },
         true
      )

      expect(mocks.findSaved).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               slug: 'ada-lovelace',
               userId: 'u1',
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

      await PageVisitService.request('u1', 'acc1', {
         kind: 'PROFILE',
         link: 'https://www.linkedin.com/in/grace-hopper/',
      })

      const [[options]] = mocks.request.mock.calls

      await options.onStart('s1', { linkedInPageVisit: { create: mocks.createVisit } })

      expect(mocks.createVisit).toHaveBeenCalledWith({
         data: expect.objectContaining({
            profileId: null,
            slug: 'grace-hopper',
         }),
      })
   })

   it('should answer nothing for a page or an account that is not the owner’s, and ask for nothing', async () => {
      mocks.findSaved.mockResolvedValueOnce(null)
      await expect(PageVisitService.request('u1', 'acc1', { profileId: 'p1' })).resolves.toBeNull()

      mocks.findSavedCompany.mockResolvedValueOnce(null)
      await expect(PageVisitService.request('u1', 'acc1', { companyId: 'c1' })).resolves.toBeNull()

      mocks.findAccount.mockResolvedValueOnce(null)
      await expect(PageVisitService.request('u1', 'acc1', { profileId: 'p1' })).resolves.toBeNull()

      expect(mocks.request).not.toHaveBeenCalled()
   })

   it('should refuse the account’s own profile', async () => {
      mocks.findOwnProfile.mockResolvedValue({ data: { profileUrl: 'https://www.linkedin.com/in/Ada-Lovelace/' } })

      await expect(PageVisitService.request('u1', 'acc1', { profileId: 'p1' })).rejects.toThrow(
         'That is the profile of this account itself.'
      )
   })

   it('should refuse a refusal the owner can read, as a refused task', async () => {
      mocks.findVisit.mockResolvedValue({ id: 'v1' })

      await expect(PageVisitService.request('u1', 'acc1', { profileId: 'p1' })).rejects.toBeInstanceOf(TaskRefusedError)
   })

   it('should name what each refusal is about, so a caller can tell a person to skip from an account to wait for', async () => {
      const reasonOf = async (ask: Promise<unknown>) => {
         const error: unknown = await ask.catch((caught: unknown) => caught)

         return error instanceof PageVisitRefusedError ? error.reason : undefined
      }

      mocks.findVisit.mockResolvedValue({ id: 'v1' })
      await expect(reasonOf(PageVisitService.request('u1', 'acc1', { profileId: 'p1' }))).resolves.toBe('REPEAT')

      mocks.findVisit.mockResolvedValue(null)
      mocks.countVisits.mockResolvedValue(15)
      await expect(reasonOf(PageVisitService.request('u1', 'acc1', { profileId: 'p1' }))).resolves.toBe('CAP')

      mocks.countVisits.mockResolvedValue(0)
      mocks.findOwnProfile.mockResolvedValue({ data: { profileUrl: 'https://www.linkedin.com/in/ada-lovelace/' } })
      await expect(reasonOf(PageVisitService.request('u1', 'acc1', { profileId: 'p1' }))).resolves.toBe('OWN')

      await expect(
         reasonOf(
            PageVisitService.request('u1', 'acc1', {
               kind: 'PROFILE',
               link: 'https://example.com/x',
            })
         )
      ).resolves.toBe('LINK')
   })

   it('should save the run and block that asked for a visit, and nothing of them for a visit asked by hand', async () => {
      await PageVisitService.request('u1', 'acc1', { profileId: 'p1' }, undefined, {
         runId: 'r1',
         nodeId: 'n1',
      })
      await PageVisitService.request('u1', 'acc1', { profileId: 'p1' })

      const [[withRun], [byHand]] = mocks.request.mock.calls

      await withRun.onStart('s1', { linkedInPageVisit: { create: mocks.createVisit } })
      await byHand.onStart('s2', { linkedInPageVisit: { create: mocks.createVisit } })

      expect(mocks.createVisit.mock.calls[0]?.[0].data).toMatchObject({
         runId: 'r1',
         nodeId: 'n1',
      })
      expect(mocks.createVisit.mock.calls[1]?.[0].data).not.toHaveProperty('runId')
   })
})
