import { lookup as dnsLookup } from 'node:dns'
import { isIP } from 'node:net'

import { isPublicAddress } from './cdnFetch'

// True unless the host is, or resolves to, an address that is not on the public internet. A name that does not resolve
// passes: connecting to it fails by itself, and the caller reports that.
export const isPublicHost = async (host: string, lookup: typeof dnsLookup = dnsLookup): Promise<boolean> => {
   const bare = host.replace(/^\[|\]$/g, '')

   if (isIP(bare) !== 0) {
      return isPublicAddress(bare)
   }

   return new Promise(resolve => {
      lookup(bare, { all: true }, (error, addresses) => {
         resolve(error ? true : addresses.every(({ address }) => isPublicAddress(address)))
      })
   })
}
