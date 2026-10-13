export const MAX_PROFILE_URLS = 200

const MAX_INVALID_LENGTH = 200
const SLUG = /^[\p{L}\p{N}_-]{3,100}$/u

export type ProfileUrl = {
   slug: string
   url: string
}

export class TooManyProfileUrlsError extends Error {
   public constructor() {
      super(`Paste at most ${MAX_PROFILE_URLS} links at once.`)
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

// Reduces any link to a person's profile to its public identifier; null for anything else.
export const parseProfileUrl = (raw: string): ProfileUrl | null => {
   let parsed: URL

   try {
      parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
   } catch {
      return null
   }

   if (!['http:', 'https:'].includes(parsed.protocol) || !isLinkedInHost(parsed.hostname.toLowerCase())) {
      return null
   }

   const [section, segment] = parsed.pathname.split('/').filter(Boolean)
   const slug = section === 'in' && segment ? decode(segment) : null

   if (!slug || !SLUG.test(slug)) {
      return null
   }

   return {
      slug,
      url: `https://www.linkedin.com/in/${encodeURIComponent(slug)}`,
   }
}

// Reads a pasted block of links: valid profiles once each by slug, and the entries that are not profile links.
export const parseProfileUrls = (text: string) => {
   const tokens = text.split(/[\s,;]+/).filter(Boolean)

   if (tokens.length > MAX_PROFILE_URLS) {
      throw new TooManyProfileUrlsError()
   }

   const profiles = new Map<string, ProfileUrl>()
   const invalid = new Set<string>()

   for (const token of tokens) {
      const profile = parseProfileUrl(token)

      if (profile) {
         profiles.set(profile.slug, profile)
      } else {
         invalid.add(token.slice(0, MAX_INVALID_LENGTH))
      }
   }

   return {
      profiles: [...profiles.values()],
      invalid: [...invalid],
   }
}
