import { describe, expect, it, vi } from 'vitest'

import { VisitError } from '../defineTask'
import { browseAfterLogin } from './browseAfterLogin'

const BASE = 'https://www.linkedin.com'

const setup = (visit: (url: string) => Promise<string>) => {
   const context = {
      browser: { scrollBy: vi.fn(async () => true) },
      visit: vi.fn(visit),
      pause: vi.fn(async () => undefined),
      log: vi.fn(),
      warn: vi.fn(),
   }

   return {
      context,
      browse: (random = () => 0) => browseAfterLogin(context as never, BASE, random),
   }
}

describe('browseAfterLogin', () => {
   it('should read down the feed, open the own profile, read it and stay 15 to 20 seconds', async () => {
      const { context, browse } = setup(async () => `${BASE}/in/ada-lovelace/`)

      await expect(browse()).resolves.toBe(true)

      expect(context.visit).toHaveBeenCalledExactlyOnceWith(`${BASE}/in/me/`)
      expect(context.browser.scrollBy).toHaveBeenCalledTimes(8)
      expect(context.pause).toHaveBeenLastCalledWith(15_000)
   })

   it('should stay no longer than 20 seconds', async () => {
      const { context, browse } = setup(async () => `${BASE}/in/ada-lovelace/`)

      await browse(() => 0.999999)

      expect(context.pause).toHaveBeenLastCalledWith(20_000)
   })

   it('should say the browser is signed out, and not stay, when the profile sends it to the sign-in page', async () => {
      const { context, browse } = setup(async () => `${BASE}/login`)

      await expect(browse()).resolves.toBe(false)

      expect(context.warn).toHaveBeenCalled()
      expect(context.pause).not.toHaveBeenCalledWith(15_000)
   })

   it('should keep the login when the profile may not be opened, and say why', async () => {
      const { context, browse } = setup(async () => {
         throw new VisitError('not-allowed', 'The address is not on the spider allowlist.')
      })

      await expect(browse()).resolves.toBe(true)

      expect(context.warn).toHaveBeenCalledWith('The address is not on the spider allowlist.')
   })

   it('should not keep the session when LinkedIn will not load the profile right after the sign-in', async () => {
      const { browse } = setup(async () => {
         throw new VisitError('load', 'The page did not load.')
      })

      await expect(browse()).resolves.toBe(false)
   })

   it('should keep the login when the browser fails while it looks around, without quoting the error', async () => {
      const { context, browse } = setup(async () => `${BASE}/in/ada/`)

      context.browser.scrollBy.mockRejectedValueOnce(new Error('secret detail'))

      await expect(browse()).resolves.toBe(true)

      expect(context.warn).toHaveBeenCalledWith('The visit to the profile stopped early')
   })
})
