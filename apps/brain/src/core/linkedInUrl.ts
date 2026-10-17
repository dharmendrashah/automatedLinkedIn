export const MAX_LINKS = 200

const MAX_INVALID_LENGTH = 200
const SLUG = /^[\p{L}\p{N}_-]{2,100}$/u

// The first path segment that marks each kind of link.
const SECTIONS = {
   profile: 'in',
   company: 'company',
} as const

export type LinkKind = keyof typeof SECTIONS | 'post'

export type LinkedInLink = {
   slug: string
   url: string
}

export class TooManyLinksError extends Error {
   public constructor() {
      super(`Paste at most ${MAX_LINKS} links at once.`)
   }
}

const isLinkedInHost = (host: string) => host === 'linkedin.com' || host.endsWith('.linkedin.com')

const decode = (segment: string) => {
   try {
      return decodeURIComponent(segment).toLowerCase()
   } catch {
      return null
   }
}

// A post is identified by its type and numeric id, found in `/posts/<author>_<text>-activity-<id>-<code>` or in the
// urn of `/feed/update/urn:li:activity:<id>`. A `lnkd.in/p/<code>` short link is kept as it is: its target is only
// known by following the redirect, which is not done.
const POST_TYPES = {
   activity: 'activity',
   share: 'share',
   ugcpost: 'ugcPost',
} as const

const POST_FROM_SLUG = /[-_](activity|share|ugcpost)-(\d{15,25})(?:-\w+)?$/i
const POST_FROM_URN = /^urn:li:(activity|share|ugcpost):(\d{15,25})$/i

const SHORT_HOST = 'lnkd.in'
const SHORT_CODE = /^[\w-]{4,40}$/

const parseShortPostPath = (pathname: string): LinkedInLink | null => {
   const [first, code] = pathname.split('/').filter(Boolean)

   if (first !== 'p' || !code || !SHORT_CODE.test(code)) {
      return null
   }

   return {
      slug: `lnkd-${code}`,
      url: `https://${SHORT_HOST}/p/${code}`,
   }
}

const parsePostPath = (pathname: string): LinkedInLink | null => {
   const [first, second, third] = pathname.split('/').filter(Boolean)
   const segment = first === 'posts' ? second : first === 'feed' && second === 'update' ? third : undefined
   const decoded = segment === undefined ? null : decode(segment)
   const match = decoded === null ? null : (first === 'posts' ? POST_FROM_SLUG : POST_FROM_URN).exec(decoded)

   if (!match) {
      return null
   }

   const type = match[1].toLowerCase() as keyof typeof POST_TYPES
   const [, , id] = match

   return {
      slug: `${type}-${id}`,
      url: `https://www.linkedin.com/feed/update/urn:li:${POST_TYPES[type]}:${id}`,
   }
}

// Reduces any link to a person's profile, a company or a post to its public identifier; null for anything else.
export const parseLinkedInUrl = (raw: string, kind: LinkKind): LinkedInLink | null => {
   let parsed: URL

   try {
      parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
   } catch {
      return null
   }

   if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
   }

   const host = parsed.hostname.toLowerCase()

   if (kind === 'post' && host === SHORT_HOST) {
      return parseShortPostPath(parsed.pathname)
   }

   if (!isLinkedInHost(host)) {
      return null
   }

   if (kind === 'post') {
      return parsePostPath(parsed.pathname)
   }

   const section = SECTIONS[kind]
   const [first, segment] = parsed.pathname.split('/').filter(Boolean)
   const slug = first === section && segment ? decode(segment) : null

   if (!slug || !SLUG.test(slug)) {
      return null
   }

   return {
      slug,
      url: `https://www.linkedin.com/${section}/${encodeURIComponent(slug)}`,
   }
}

// Reads a pasted block of links: valid ones once each by slug, and the entries that are not links of this kind.
export const parseLinkedInUrls = (text: string, kind: LinkKind) => {
   const tokens = text.split(/[\s,;]+/).filter(Boolean)

   if (tokens.length > MAX_LINKS) {
      throw new TooManyLinksError()
   }

   const links = new Map<string, LinkedInLink>()
   const invalid = new Set<string>()

   for (const token of tokens) {
      const link = parseLinkedInUrl(token, kind)

      if (link) {
         links.set(link.slug, link)
      } else {
         invalid.add(token.slice(0, MAX_INVALID_LENGTH))
      }
   }

   return {
      links: [...links.values()],
      invalid: [...invalid],
   }
}
