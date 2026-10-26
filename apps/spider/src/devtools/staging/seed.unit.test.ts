import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { type Profiles } from '../../sessions/profiles'
import { readOnlyProfiles, removePulled } from './seed'

describe('removePulled', () => {
   const pulled = () => {
      const root = mkdtempSync(join(tmpdir(), 'seed-test-'))

      writeFileSync(join(root, 'state.enc.json'), '{}')

      return root
   }

   it('removes the pulled files', () => {
      const root = pulled()

      removePulled(root, false)

      expect(existsSync(root)).toBe(false)
   })

   it('keeps them when asked, so they can be looked at', () => {
      const root = pulled()

      removePulled(root, true)

      expect(existsSync(root)).toBe(true)
      removePulled(root, false)
   })
})

describe('readOnlyProfiles', () => {
   const setup = () => {
      const keep = vi.fn(async () => undefined)
      const release = vi.fn(async () => undefined)
      const inner: Profiles = {
         checkout: async () => ({
            dir: '/tmp/profile-1',
            restored: true,
            keep,
            release,
         }),
      }

      return {
         keep,
         release,
         profiles: readOnlyProfiles(inner),
      }
   }

   it('hands out the profile as it is but never keeps it, so nothing is packed for staging', async () => {
      const { keep, release, profiles } = setup()
      const checkout = await profiles.checkout('a1')

      expect(checkout.dir).toBe('/tmp/profile-1')
      expect(checkout.restored).toBe(true)

      await checkout.keep()
      await checkout.release()

      expect(keep).not.toHaveBeenCalled()
      expect(release).toHaveBeenCalledOnce()
   })

   it('starts the next run from the saved session once a run kept one, not from the older profile', async () => {
      const { profiles } = setup()

      await (await profiles.checkout('a1')).keep()

      expect((await profiles.checkout('a1')).restored).toBe(false)
   })
})
