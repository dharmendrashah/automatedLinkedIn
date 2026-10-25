import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { browse } from './browse'

const mocks = vi.hoisted(() => {
   class BrowseSettingsError extends Error {}

   return {
      BrowseSettingsError,
      overview: vi.fn(),
      year: vi.fn(),
      day: vi.fn(),
      mix: vi.fn(),
      change: vi.fn(),
   }
})

vi.mock('database', () => ({
   BrowseSettingsError: mocks.BrowseSettingsError,
   BrowseService: {
      overview: mocks.overview,
      year: mocks.year,
      day: mocks.day,
      mix: mocks.mix,
      change: mocks.change,
   },
   ConflictError: class ConflictError extends Error {},
}))

vi.mock('env', () => ({
   AUTHENTIK_ISSUER: 'http://localhost:9000/application/o/automatedlinkedin/',
   AUTHENTIK_CLIENT_ID: 'automatedlinkedin',
   AUTHENTIK_INTERNAL_URL: '',
   DATABASE_URL: 'postgresql://localhost:5432/test',
   CORS_ORIGINS: 'http://localhost:3000',
   LINKEDIN_CRED_ENC_KEY: 'pqaZGClH/kqxNTLoLT4c0lMTloNIi2At3Jzz9a2rkIQ=',
   GIT_SHA: 'test',
   BUILD_TIME: 'test',
   PORT: 3001,
}))

const user = {
   id: 'u1',
   email: 'ada@elitale.com',
   name: 'Ada',
   role: 'USER',
   authentikId: 'sub-1',
   createdAt: new Date(),
   updatedAt: new Date(),
}

const caller = () =>
   router({ browse }).createCaller({
      auth: {
         token: 'tok',
         sub: 'sub-1',
      },
      user,
   } as unknown as Context).browse

const HOURS = {
   days: [1, 2, 3, 4, 5],
   startMinute: 540,
   endMinute: 1080,
   timeZone: 'Asia/Kolkata',
}

describe('browse resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should hand the owner’s id, never one from the input, to every read', async () => {
      mocks.overview.mockResolvedValue([])
      mocks.year.mockResolvedValue([])
      mocks.day.mockResolvedValue([])
      mocks.mix.mockResolvedValue([])

      await caller().overview()
      await caller().year({
         accountId: 'a1',
         year: 2026,
      })
      await caller().day({
         accountId: 'a1',
         day: '2026-10-21',
      })
      await caller().mix({ accountId: 'a1' })

      expect(mocks.overview).toHaveBeenCalledWith('u1')
      expect(mocks.year).toHaveBeenCalledWith('u1', 'a1', 2026)
      expect(mocks.day).toHaveBeenCalledWith('u1', 'a1', '2026-10-21')
      expect(mocks.mix).toHaveBeenCalledWith('u1', 'a1')
   })

   it('should answer an account that is not the owner’s like a missing one', async () => {
      mocks.year.mockResolvedValue(null)

      await expect(caller().year({ accountId: 'other' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })

   it('should change the accounts it names, turning an empty client into none', async () => {
      mocks.change.mockResolvedValue(['a1', 'a2'])

      await expect(
         caller().change({
            accountIds: ['a1', 'a2'],
            mode: 'MODERATE',
            clientLabel: '',
         })
      ).resolves.toEqual(['a1', 'a2'])
      expect(mocks.change).toHaveBeenCalledWith('u1', ['a1', 'a2'], {
         mode: 'MODERATE',
         clientLabel: null,
      })
   })

   it('should say why a change cannot be kept, as a bad request', async () => {
      mocks.change.mockRejectedValue(
         new mocks.BrowseSettingsError('a@x.com: Safe needs at least 1 h 30 min of working time.')
      )

      await expect(
         caller().change({
            accountIds: ['a1'],
            hours: HOURS,
         })
      ).rejects.toMatchObject({
         code: 'BAD_REQUEST',
         message: 'a@x.com: Safe needs at least 1 h 30 min of working time.',
      })
   })

   it('should refuse a change with no account, a mode it does not know or a weekday out of range', async () => {
      await expect(caller().change({ accountIds: [] })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
         caller().change({
            accountIds: ['a1'],
            mode: 'WILD' as unknown as 'SAFE',
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
         caller().change({
            accountIds: ['a1'],
            hours: {
               ...HOURS,
               days: [8],
            },
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(mocks.change).not.toHaveBeenCalled()
   })
})
