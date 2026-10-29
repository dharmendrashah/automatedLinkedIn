import { type LookupAddress, type LookupOptions, lookup as dnsLookup } from 'node:dns'
import { type IncomingMessage } from 'node:http'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'

import { parseRemoteUrl } from './cdnUrl'

// Opens a public remote file for the file cache without reaching a private address (.plan/cdn-public-endpoint.md).

// REFUSED: a private address, or a redirect to an address that may not be fetched.
export type CdnFetchFailure = 'NOT_FOUND' | 'REFUSED' | 'TOO_BIG' | 'TIMEOUT' | 'BAD_GATEWAY'

export class CdnFetchError extends Error {
   public readonly reason: CdnFetchFailure

   public constructor(reason: CdnFetchFailure) {
      super(`The remote file could not be fetched: ${reason}`)
      this.reason = reason
   }
}

const MAX_REDIRECTS = 3
const HEADERS_TIMEOUT_MS = 15_000

const PRIVATE = new BlockList()

for (const [address, prefix] of [
   ['0.0.0.0', 8],
   ['10.0.0.0', 8],
   ['100.64.0.0', 10],
   ['127.0.0.0', 8],
   ['169.254.0.0', 16],
   ['172.16.0.0', 12],
   ['192.0.0.0', 24],
   ['192.0.2.0', 24],
   ['192.168.0.0', 16],
   ['198.18.0.0', 15],
   ['198.51.100.0', 24],
   ['203.0.113.0', 24],
   ['224.0.0.0', 3],
] as const) {
   PRIVATE.addSubnet(address, prefix, 'ipv4')
}

// Loopback, unspecified, NAT64, discard, Teredo, documentation, 6to4, unique-local, link-local and multicast. IPv4-mapped
// addresses are checked against the IPv4 rules by BlockList itself (a ::ffff:0:0/96 rule would match every IPv4 address).
for (const [address, prefix] of [
   ['::', 127],
   ['64:ff9b::', 96],
   ['100::', 64],
   ['2001::', 32],
   ['2001:db8::', 32],
   ['2002::', 16],
   ['fc00::', 7],
   ['fe80::', 10],
   ['ff00::', 8],
] as const) {
   PRIVATE.addSubnet(address, prefix, 'ipv6')
}

export const isPublicAddress = (address: string) => {
   const family = isIP(address)

   return family !== 0 && !PRIVATE.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

// The connection's own lookup, so the address that is checked is the address that is used (no DNS rebinding in between).
export const publicLookup =
   (lookup: typeof dnsLookup = dnsLookup) =>
   (hostname: string, options: LookupOptions, callback: LookupCallback) => {
      lookup(
         hostname,
         {
            ...options,
            all: true,
         },
         (error, addresses) => {
            if (error) {
               return callback(error, [])
            }

            if (addresses.length === 0 || !addresses.every(({ address }) => isPublicAddress(address))) {
               return callback(new CdnFetchError('REFUSED'), [])
            }

            if (options.all) {
               return callback(null, addresses)
            }

            const [first] = addresses

            return callback(null, first?.address ?? '', first?.family)
         }
      )
   }

export type Get = (url: URL, signal: AbortSignal) => Promise<IncomingMessage>

const httpsGet: Get = (url, signal) =>
   new Promise((resolve, reject) => {
      const outgoing = request(
         url,
         {
            signal,
            lookup: publicLookup(),
            headers: {
               accept: '*/*',
               'accept-encoding': 'identity',
               'user-agent': 'Mozilla/5.0 (compatible; ElitaleCdn/1.0)',
            },
         },
         resolve
      )

      outgoing.on('error', reject)
      outgoing.end()
   })

const failureOf = (error: unknown) => {
   if (error instanceof CdnFetchError) {
      return error
   }

   const cause: unknown = error instanceof Error ? error.cause : undefined

   if (cause instanceof CdnFetchError) {
      return cause
   }

   return new CdnFetchError(error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'BAD_GATEWAY')
}

export type RemoteFile = {
   response: IncomingMessage
   // Ends the fetch; it takes `ms` from now at the most.
   deadline: (ms: number) => void
   // Stops the deadline once the body was read.
   finish: () => void
   abort: () => void
}

// Follows at most three redirects, each checked like the first address. Resolves when the answer's headers are in.
export const openRemote = async (url: URL, get: Get = httpsGet): Promise<RemoteFile> => {
   const controller = new AbortController()
   let timer = setTimeout(() => controller.abort(), HEADERS_TIMEOUT_MS)
   const deadline = (ms: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => controller.abort(), ms)
   }
   const finish = () => clearTimeout(timer)
   const abort = () => {
      finish()
      controller.abort()
   }

   try {
      let current = url

      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
         const response = await get(current, controller.signal)
         const status = response.statusCode ?? 0
         const { location } = response.headers

         if (status >= 300 && status < 400 && location) {
            response.resume()

            const next = URL.canParse(location, current) ? parseRemoteUrl(new URL(location, current).href) : null

            if (!next) {
               throw new CdnFetchError('REFUSED')
            }

            current = next
            continue
         }

         if (status >= 200 && status < 300) {
            return {
               response,
               deadline,
               finish,
               abort,
            }
         }

         response.resume()

         throw new CdnFetchError(status === 404 || status === 410 ? 'NOT_FOUND' : 'BAD_GATEWAY')
      }

      throw new CdnFetchError('BAD_GATEWAY')
   } catch (error) {
      abort()

      throw failureOf(error)
   }
}
