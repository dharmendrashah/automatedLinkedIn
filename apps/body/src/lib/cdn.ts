import { createApiUrl } from '../trpc/config'

// Pictures and videos from other sites load through brain's file cache (GET /cdn), so they still show after their links expire.

// Our own hosts and Google Cloud Storage (signed, private links: a public copy would leak them) are loaded directly.
const DIRECT_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)elitale\.com$/, /^localhost$/]

// LinkedIn's private message pictures need the account's cookies, which the cache does not have.
const isPrivateLinkedIn = ({ hostname, pathname }: URL) =>
   hostname === 'www.linkedin.com' && pathname.startsWith('/dms/prv/')

const defaultApi = () => createApiUrl(import.meta.env)

export const cdnUrlOf = (url: string, api = defaultApi()) => {
   if (!url.startsWith('https://') || !URL.canParse(url)) {
      return url
   }

   const parsed = new URL(url)

   if (DIRECT_HOSTS.some(host => host.test(parsed.hostname)) || isPrivateLinkedIn(parsed)) {
      return url
   }

   return `${api}/cdn?url=${encodeURIComponent(url)}`
}

// The address to load: the cached copy (or our own direct address) once; a third-party original is never loaded.
export const mediaSource = (url: string | null | undefined, failures: number, api = defaultApi()) =>
   url && failures === 0 ? cdnUrlOf(url, api) : undefined
