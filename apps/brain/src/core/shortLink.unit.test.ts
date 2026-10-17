import { describe, expect, it, vi } from 'vitest'

import { expandShortPostLink } from './shortLink'

const redirect = (status: number, location?: string) =>
   vi.fn(
      async () =>
         new Response(null, {
            status,
            headers: location ? { location } : {},
         })
   )

const SHORT = 'https://lnkd.in/p/gtzWY58E'
const TARGET =
   'https://www.linkedin.com/posts/yhesham_running-claude-code-in-the-cloud-is-the-best-share-7516986460906954752-Fh8V/?utm_source=share&rcm=ACoAAC'

describe('expandShortPostLink', () => {
   it('should read the redirect target without following it and drop the tracking query', async () => {
      const fetcher = redirect(301, TARGET)

      await expect(expandShortPostLink(SHORT, fetcher)).resolves.toBe(
         'https://www.linkedin.com/posts/yhesham_running-claude-code-in-the-cloud-is-the-best-share-7516986460906954752-Fh8V/'
      )
      expect(fetcher).toHaveBeenCalledWith(
         SHORT,
         expect.objectContaining({
            method: 'HEAD',
            redirect: 'manual',
         })
      )
   })

   it('should refuse a target that is not a LinkedIn post, a non-redirect and a failed request', async () => {
      await expect(expandShortPostLink(SHORT, redirect(301, 'https://evil.example/posts/x'))).resolves.toBeNull()
      await expect(expandShortPostLink(SHORT, redirect(200))).resolves.toBeNull()
      await expect(
         expandShortPostLink(
            SHORT,
            vi.fn(async () => {
               throw new Error('offline')
            })
         )
      ).resolves.toBeNull()
   })

   it('should never request anything but a lnkd.in post link', async () => {
      const fetcher = redirect(301, TARGET)

      await expect(expandShortPostLink('https://example.com/p/abcd', fetcher)).resolves.toBeNull()
      expect(fetcher).not.toHaveBeenCalled()
   })
})
