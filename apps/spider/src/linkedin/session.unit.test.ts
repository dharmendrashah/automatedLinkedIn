import { describe, expect, it, vi } from 'vitest'

import { VisitError } from '../tasks/defineTask'
import { SignedOut, createSession, isSignedOutPage } from './session'

const BASE = 'https://www.linkedin.com'

describe('isSignedOutPage', () => {
   it.each([`${BASE}/`, BASE, `${BASE}/?trk=public`, `${BASE}/uas/login`, `${BASE}/checkpoint/x`])(
      'should say %s is a page for someone who is not signed in',
      url => {
         expect(isSignedOutPage(url)).toBe(true)
      }
   )

   it.each([`${BASE}/feed/`, `${BASE}/in/ada/`, `${BASE}/messaging/`, `${BASE}/connect-services/consent`])(
      'should say %s is not',
      url => {
         expect(isSignedOutPage(url)).toBe(false)
      }
   )
})

const setup = (visit: (url: string) => Promise<string>, back: () => Promise<string> = async () => `${BASE}/feed/`) => {
   const browser = {
      clearCookies: vi.fn(async (_name: string) => undefined),
      exists: vi.fn(async (_selector: string, _ms: number) => true),
      click: vi.fn(async (_selector: string) => ''),
   }
   const log = vi.fn()
   const opened = vi.fn(visit)
   const session = createSession({
      browser,
      hands: { back },
      visit: opened,
      log,
      baseUrl: BASE,
   })

   return {
      browser,
      log,
      opened,
      session,
   }
}

describe('createSession', () => {
   it('should say signed out when a page opens on a sign-in or a security check', async () => {
      const { session } = setup(async () => `${BASE}/uas/login`)

      await expect(session.open(`${BASE}/feed/`)).rejects.toBeInstanceOf(SignedOut)
      expect(() => session.signedIn(`${BASE}/checkpoint/challenge`)).toThrow(SignedOut)
      expect(session.signedIn(`${BASE}/in/ada/`)).toBe(`${BASE}/in/ada/`)
   })

   it('should open the feed again without the token when the first load failed, once', async () => {
      const visit = vi
         .fn<(url: string) => Promise<string>>()
         .mockRejectedValueOnce(new VisitError('load', 'The page did not load.'))
         .mockResolvedValue(`${BASE}/feed/`)
      const { session, browser } = setup(visit)

      await expect(session.openFeed()).resolves.toBe(`${BASE}/feed/`)
      expect(browser.clearCookies).toHaveBeenCalledWith('li_at')
   })

   it('should let a second failure, or a failure that is not a load, go on as an error', async () => {
      const failing = setup(async () => {
         throw new VisitError('load', 'The page did not load.')
      })
      const refused = setup(async () => {
         throw new VisitError('robots', 'Not allowed.')
      })

      await expect(failing.session.openFeed()).rejects.toThrow('The page did not load.')
      await expect(refused.session.openFeed()).rejects.toThrow('Not allowed.')
      expect(refused.browser.clearCookies).not.toHaveBeenCalled()
   })

   it('should accept the consent page only when it is on it and shows the button', async () => {
      const { session, browser, log } = setup(async () => `${BASE}/feed/`)

      await session.acceptConsent(`${BASE}/feed/`)
      expect(browser.click).not.toHaveBeenCalled()

      await session.acceptConsent(`${BASE}/connect-services/consent`)
      expect(browser.click).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith('Accepted the ads consent page')
   })

   it('should go back the steps asked, and open the feed again when history did not lead to it', async () => {
      const onFeed = setup(
         async () => `${BASE}/feed/`,
         async () => `${BASE}/feed/`
      )
      const elsewhere = setup(
         async () => `${BASE}/feed/`,
         async () => `${BASE}/in/ada/`
      )

      await onFeed.session.goBack(2)
      await elsewhere.session.goBack(1)

      expect(onFeed.log).toHaveBeenCalledWith('Back on the feed')
      expect(onFeed.opened).not.toHaveBeenCalled()
      expect(elsewhere.opened).toHaveBeenCalledWith(`${BASE}/feed/`)
   })
})
