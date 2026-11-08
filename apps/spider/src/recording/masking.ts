import { maskParameters } from '@automatedLinkedIn/logger'

const HIDDEN = '***'

const SECRET_HEADERS = new Set(['authorization', 'proxy-authorization'])
const TOKEN_HEADERS = new Set(['csrf-token', 'x-csrf-token'])

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

// An address keeps its shape, with credentials in it and the values of sensitive parameters hidden.
export const maskUrl = (url: string) => maskParameters(url.replace(/\/\/[^/\s@]*@/, `//${HIDDEN}@`), '[?&;]')
