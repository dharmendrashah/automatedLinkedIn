import { beforeEach, describe, expect, it, vi } from 'vitest'

import { router } from 'trpc'

import { type Context } from '../../context'
import { icp } from './icp'

const mocks = vi.hoisted(() => ({
   create: vi.fn(),
   getForUser: vi.fn(),
}))

vi.mock('database', () => ({
   ConflictError: class extends Error {},
   IcpService: {
      create: mocks.create,
      getForUser: mocks.getForUser,
   },
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

const ctx = {
   auth: {
      token: 'tok',
      sub: 'sub-1',
   },
   user: { id: 'u1' },
} as unknown as Context

const caller = () => router({ icp }).createCaller(ctx).icp

const rules = {
   name: 'Founders',
   includeTitles: [' Founder ', 'founder'],
   excludeTitles: [],
   seniorities: ['OWNER' as const],
   industries: [],
   companySizes: [],
   locations: ['London'],
   problemKeywords: [],
}

describe('icp resolvers', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should save cleaned, de-duplicated rules and refuse an unknown seniority', async () => {
      mocks.create.mockResolvedValueOnce({ id: 'i1' })

      await caller().create(rules)

      expect(mocks.create).toHaveBeenCalledWith('u1', {
         ...rules,
         includeTitles: ['founder'],
         locations: ['london'],
      })
      await expect(
         caller().create({
            ...rules,
            seniorities: ['INTERN' as never],
         })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
   })

   it('should score each sample line with its headline and location', async () => {
      mocks.getForUser.mockResolvedValueOnce({
         ...rules,
         includeTitles: ['founder'],
         locations: ['london'],
      })

      const result = await caller().preview({
         id: 'i1',
         samples: 'Founder at Acme | London, UK\n\n  Sales intern  ',
      })

      expect(result.maxScore).toBe(55)
      expect(result.results).toEqual([
         {
            headline: 'Founder at Acme',
            location: 'London, UK',
            score: 55,
            disqualified: false,
            matched: ['title "founder"', 'seniority OWNER', 'location "london"'],
         },
         {
            headline: 'Sales intern',
            location: null,
            score: 0,
            disqualified: false,
            matched: [],
         },
      ])
   })

   it('should answer NOT_FOUND when previewing a foreign ideal customer', async () => {
      mocks.getForUser.mockResolvedValueOnce(null)

      await expect(
         caller().preview({
            id: 'i9',
            samples: 'x',
         })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
   })
})
