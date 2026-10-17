// LinkedIn short post links (lnkd.in/p/<code>) redirect to the post. The data service cannot read them, so the
// redirect target is read once: only the Location header, without following it or loading any page.

const SHORT_LINK = /^https:\/\/lnkd\.in\/p\/[\w-]{4,40}$/
const TIMEOUT_MS = 5_000

const isLinkedInPost = (url: URL) =>
   url.protocol === 'https:' &&
   (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) &&
   /^\/(posts|feed\/update)\//.test(url.pathname)

export const isShortPostLink = (url: string) => SHORT_LINK.test(url)

// The linkedin.com post a short link points to, without its tracking query; null when it cannot be told.
export const expandShortPostLink = async (url: string, fetcher: typeof fetch = fetch): Promise<string | null> => {
   if (!isShortPostLink(url)) {
      return null
   }

   try {
      const response = await fetcher(url, {
         method: 'HEAD',
         redirect: 'manual',
         signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const location = response.headers.get('location')

      if (response.status < 300 || response.status >= 400 || !location) {
         return null
      }

      const target = new URL(location, url)

      return isLinkedInPost(target) ? `${target.origin}${target.pathname}` : null
   } catch {
      return null
   }
}
