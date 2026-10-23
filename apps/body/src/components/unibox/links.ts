export type Piece =
   { type: 'text'; text: string } | { type: 'link'; text: string; href: string; domain: string; shortened: boolean }

// Addresses that hide where they lead.
const SHORTENERS = new Set([
   'bit.ly',
   'lnkd.in',
   't.co',
   'tinyurl.com',
   'goo.gl',
   'ow.ly',
   'buff.ly',
   'is.gd',
   'rebrand.ly',
   'cutt.ly',
])

const ADDRESS = /(?:https?:\/\/|www\.)[^\s<>"']+/gi
const TRAILING = /[.,;:!?)\]}]+$/

// Cuts a message into words and links. Messages are other people's words, so only http and https addresses become links; the host
// shown is the real one (the part after a name and an @ is what the browser goes to); nothing is fetched.
export const linkify = (text: string): Piece[] => {
   const pieces: Piece[] = []
   let from = 0

   for (const found of text.matchAll(ADDRESS)) {
      const shown = found[0].replace(TRAILING, '')
      const href = URL.canParse(shown.startsWith('www.') ? `https://${shown}` : shown)
         ? new URL(shown.startsWith('www.') ? `https://${shown}` : shown)
         : undefined

      if (!href || !['http:', 'https:'].includes(href.protocol)) {
         continue
      }

      if (found.index > from) {
         pieces.push({ type: 'text', text: text.slice(from, found.index) })
      }

      const domain = href.hostname.replace(/^www\./, '')

      pieces.push({
         type: 'link',
         text: shown,
         href: href.href,
         domain,
         shortened: SHORTENERS.has(domain),
      })
      from = found.index + shown.length
   }

   if (from < text.length) {
      pieces.push({ type: 'text', text: text.slice(from) })
   }

   return pieces
}
