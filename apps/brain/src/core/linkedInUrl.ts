export const MAX_LINKS = 200

const MAX_INVALID_LENGTH = 200
const SLUG = /^[\p{L}\p{N}_-]{2,100}$/u

// The first path segment that marks each kind of link.
const SECTIONS = {
   profile: 'in',
   company: 'company',
} as const

export type LinkKind = keyof typeof SECTIONS

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

// Reduces any link to a person's profile or a company to its public identifier; null for anything else.
export const parseLinkedInUrl = (raw: string, kind: LinkKind): LinkedInLink | null => {
   let parsed: URL

   try {
      parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
   } catch {
      return null
   }

   if (!['http:', 'https:'].includes(parsed.protocol) || !isLinkedInHost(parsed.hostname.toLowerCase())) {
      return null
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
