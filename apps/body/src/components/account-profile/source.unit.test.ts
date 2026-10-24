import { describe, expect, it } from 'vitest'

import { accountProfileSchema } from '@automatedLinkedIn/contracts'

import { SAMPLE_KINDS, loadProfile, sampleKindOf } from './source'

const NOW = new Date('2026-10-24T12:00:00Z')

describe('the sample profiles', () => {
   it.each(SAMPLE_KINDS.filter(kind => kind !== 'empty'))(
      'should be a profile the contract accepts: %s',
      async kind => {
         const { profile } = await loadProfile(kind, NOW)

         expect(accountProfileSchema.safeParse(profile).success).toBe(true)
      }
   )

   it('should have every section filled in the full one, and none in the sparse one', async () => {
      const full = (await loadProfile('full', NOW)).profile
      const sparse = (await loadProfile('sparse', NOW)).profile

      expect(full?.experience.length).toBeGreaterThan(0)
      expect(full?.education.length).toBeGreaterThan(0)
      expect(full?.projects.items.length).toBeGreaterThan(0)
      expect(full?.skills.total).toBeGreaterThan(full?.skills.items.length ?? 0)
      expect(full?.recommendations.received.items.length).toBeGreaterThan(0)
      expect(full?.recommendations.given.items.length).toBeGreaterThan(0)
      expect(full?.languages.items.length).toBeGreaterThan(0)
      expect(Object.values(full?.interests ?? {}).every(list => list.length > 0)).toBe(true)
      expect(full?.peopleYouMayKnow.length).toBeGreaterThan(0)
      expect(full?.youMightLike.length).toBeGreaterThan(0)
      expect(sparse?.experience).toEqual([])
      expect(sparse?.followers).toBeUndefined()
   })

   it('should say it is a sample, and give nothing for an account that was never read', async () => {
      await expect(loadProfile('empty', NOW)).resolves.toEqual({
         profile: null,
         sample: true,
      })
   })

   it('should say when the profile was read, relative to now', async () => {
      const { profile } = await loadProfile('full', NOW)

      expect(profile?.captured_at).toBe('2026-10-24T09:00:00.000Z')
   })
})

describe('sampleKindOf', () => {
   it('should pick the kind named in the address, and the full profile otherwise', () => {
      expect(sampleKindOf('sparse')).toBe('sparse')
      expect(sampleKindOf('empty')).toBe('empty')
      expect(sampleKindOf('other')).toBe('full')
      expect(sampleKindOf(null)).toBe('full')
   })
})
