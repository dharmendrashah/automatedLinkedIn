const HIDDEN = '***'

const MAX_TEXT = 2000

const SECRET_HEADERS = new Set(['authorization', 'proxy-authorization'])
const TOKEN_HEADERS = new Set(['csrf-token', 'x-csrf-token'])

const SENSITIVE_NAME = '[A-Za-z0-9_.-]*(?:token|secret|password|passwd|code|pin|csrf|session|key)[A-Za-z0-9_.-]*'

// Cookie names stay, so "which cookies were sent" is still visible; every value goes.
const maskPairs = (value: string) =>
   value
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => (part.includes('=') ? `${part.slice(0, part.indexOf('='))}=${HIDDEN}` : HIDDEN))
      .join('; ')

const maskHeader = (name: string, value: string) => {
   const key = name.toLowerCase()

   if (key === 'cookie') {
      return maskPairs(value)
   }

   if (key === 'set-cookie') {
      // One cookie per line; its attributes (Path, Secure ...) are dropped, they add nothing to debugging.
      return value
         .split(/\r?\n/)
         .map(line => maskPairs(line.split(';')[0]))
         .join('\n')
   }

   if (SECRET_HEADERS.has(key)) {
      const [scheme, ...rest] = value.trim().split(/\s+/)

      return rest.length > 0 ? `${scheme} ${HIDDEN}` : HIDDEN
   }

   return TOKEN_HEADERS.has(key) ? HIDDEN : value
}

export const maskHeaders = (headers: Record<string, string>): Record<string, string> =>
   Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, maskHeader(name, String(value))]))

const maskParameters = (text: string, boundary: string) =>
   text.replace(new RegExp(`(${boundary})(${SENSITIVE_NAME})=([^&#\\s"';]*)`, 'gi'), `$1$2=${HIDDEN}`)

// An address keeps its shape, with credentials in it and the values of sensitive parameters hidden.
export const maskUrl = (url: string) => maskParameters(url.replace(/\/\/[^/\s@]*@/, `//${HIDDEN}@`), '[?&;]')

// For free text (log lines): addresses with credentials, bearer tokens and sensitive parameters. Cut at 2,000 characters.
export const maskText = (text: string) => {
   const masked = maskParameters(
      text.replace(/\/\/[^/\s@]+@/g, `//${HIDDEN}@`).replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, `Bearer ${HIDDEN}`),
      '\\b'
   )

   return masked.length > MAX_TEXT ? `${masked.slice(0, MAX_TEXT)}…` : masked
}
