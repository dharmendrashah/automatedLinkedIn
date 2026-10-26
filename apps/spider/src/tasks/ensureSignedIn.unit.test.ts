import { describe, expect, it, vi } from 'vitest'

import { VisitError } from './defineTask'
import { ensureSignedIn } from './ensureSignedIn'

const BASE = 'https://www.linkedin.com'

// Each address answers with the page it lands on (a list is the answers of its successive visits, the last one repeating), or with
// a load failure (a 404 does not load).
const setup = (
   pages: Record<string, string | string[] | 'fail'>,
   signIn: () => Promise<boolean> = async () => true
) => {
   const opened: string[] = []
   const lines: string[] = []
   const visit = async (url: string) => {
      opened.push(url)

      const answer = pages[url]
      const page = Array.isArray(answer) ? (answer.length > 1 ? answer.shift() : answer[0]) : answer

      if (page === undefined || page === 'fail') {
         throw new VisitError('load', 'The page did not load.')
      }

      return page
   }
   const signer = vi.fn(signIn)
   const settle = vi.fn(async () => undefined)

   return {
      opened,
      lines,
      signer,
      settle,
      run: () =>
         ensureSignedIn({
            baseUrl: BASE,
            visit,
            signIn: signer,
            afterSignIn: settle,
            log: line => lines.push(line),
         }),
   }
}

describe('ensureSignedIn', () => {
   it('goes on when the feed opens, without signing in, waiting or scrolling', async () => {
      const { run, signer, settle, opened } = setup({ [`${BASE}/feed/`]: `${BASE}/feed/` })

      expect(await run()).toBe('READY')
      expect(signer).not.toHaveBeenCalled()
      expect(settle).not.toHaveBeenCalled()
      expect(opened).toEqual([`${BASE}/feed/`])
   })

   it.each(['/', '/uas/login', '/login', '/checkpoint/challenge/x', '/authwall'])(
      'signs in when the feed shows %s, lands on the feed again, then waits and scrolls',
      async path => {
         const { run, signer, settle, opened } = setup({ [`${BASE}/feed/`]: [`${BASE}${path}`, `${BASE}/feed/`] })

         expect(await run()).toBe('SIGNED_IN')
         expect(signer).toHaveBeenCalledOnce()
         expect(opened).toEqual([`${BASE}/feed/`, `${BASE}/feed/`])
         expect(settle).toHaveBeenCalledOnce()
      }
   )

   it('fails, once, when the feed still asks for a sign-in after a sign-in that said it worked', async () => {
      const { run, signer, settle } = setup({ [`${BASE}/feed/`]: `${BASE}/uas/login` })

      expect(await run()).toBe('FAILED')
      expect(signer).toHaveBeenCalledOnce()
      expect(settle).not.toHaveBeenCalled()
   })

   it('looks at the login page when the feed gives a 404, and goes on when it leads to the feed', async () => {
      const { run, signer, opened } = setup({
         [`${BASE}/feed/`]: 'fail',
         [`${BASE}/login`]: `${BASE}/feed/`,
      })

      expect(await run()).toBe('READY')
      expect(signer).not.toHaveBeenCalled()
      expect(opened).toEqual([`${BASE}/feed/`, `${BASE}/login`])
   })

   it('signs in when the feed gives a 404 and the login page stays a login page', async () => {
      const { run, signer } = setup({
         [`${BASE}/feed/`]: ['fail', `${BASE}/feed/`],
         [`${BASE}/login`]: `${BASE}/login`,
      })

      expect(await run()).toBe('SIGNED_IN')
      expect(signer).toHaveBeenCalledOnce()
   })

   it('tries the sign-in when neither page loads, and fails when it does not work', async () => {
      const { run, signer } = setup({}, async () => false)

      expect(await run()).toBe('FAILED')
      expect(signer).toHaveBeenCalledOnce()
   })

   it('fails, once, when the sign-in does not work', async () => {
      const { run, signer, lines } = setup({ [`${BASE}/feed/`]: `${BASE}/login` }, async () => false)

      expect(await run()).toBe('FAILED')
      expect(signer).toHaveBeenCalledOnce()
      expect(lines.join('\n')).toMatch(/did not work/)
   })

   it('goes on from a page that is neither the feed nor a sign-in page, for the task to judge', async () => {
      const { run, signer } = setup({ [`${BASE}/feed/`]: `${BASE}/connect-services/consent` })

      expect(await run()).toBe('READY')
      expect(signer).not.toHaveBeenCalled()
   })

   it('lets any other error out, such as an address the allowlist refuses', async () => {
      const visit = async () => {
         throw new VisitError('not-allowed', 'The address is not on the spider allowlist.')
      }

      await expect(
         ensureSignedIn({
            baseUrl: BASE,
            visit,
            signIn: async () => true,
            log: () => undefined,
         })
      ).rejects.toThrow(/allowlist/)
   })
})
