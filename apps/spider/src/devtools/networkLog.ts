export type NetworkEntry = {
   method: string
   host: string
   path: string
   status: number
   type: string
}

// The requests that say how a page talks to its server; pictures, scripts, styles and fonts are left out.
const KEPT = new Set(['document', 'fetch', 'xhr'])
const MOST_CHARS = 300

// One line of `network.json`: where a request went and what answered. No query, no header and no body, so no token or text of
// someone else is ever written. Undefined for a request that is not kept.
export const networkEntry = (
   method: string,
   address: string,
   status: number,
   resourceType: string
): NetworkEntry | undefined => {
   if (!KEPT.has(resourceType) || !URL.canParse(address)) {
      return undefined
   }

   const { protocol, hostname, pathname } = new URL(address)

   return protocol === 'https:' || protocol === 'http:'
      ? {
           method,
           host: hostname,
           path: pathname.slice(0, MOST_CHARS),
           status,
           type: resourceType,
        }
      : undefined
}
