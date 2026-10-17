import { type LookupAddress, lookup } from 'node:dns'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'

import { type WorkflowItemData } from 'core'

// "Send via API": posts what reached the block to the owner's HTTPS address. Only public addresses are reached; the
// check runs on the address the connection really uses, so a name that later points inside the network is refused.

export type Post = (url: string, body: string, headers: Record<string, string>) => Promise<{ status: number }>

const PAGE_SIZE = 1_000
const TIMEOUT_MS = 10_000
const BACKOFF_MS = [1_000, 3_000]

const PRIVATE = new BlockList()

for (const [network, prefix] of [
   ['0.0.0.0', 8],
   ['10.0.0.0', 8],
   ['100.64.0.0', 10],
   ['127.0.0.0', 8],
   ['169.254.0.0', 16],
   ['172.16.0.0', 12],
   ['192.0.0.0', 24],
   ['192.168.0.0', 16],
   ['198.18.0.0', 15],
   ['224.0.0.0', 4],
   ['240.0.0.0', 4],
] as const) {
   PRIVATE.addSubnet(network, prefix, 'ipv4')
}

for (const [network, prefix] of [
   ['::', 128],
   ['::1', 128],
   ['fc00::', 7],
   ['fe80::', 10],
   ['ff00::', 8],
] as const) {
   PRIVATE.addSubnet(network, prefix, 'ipv6')
}

export const isPublicAddress = (address: string): boolean => {
   const family = isIP(address)

   if (family === 0) {
      return false
   }

   if (family === 6 && address.toLowerCase().startsWith('::ffff:')) {
      return isPublicAddress(address.slice(7))
   }

   return !PRIVATE.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

const REFUSED = 'the address is not a public internet address'

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

// Resolves like the system does, then refuses the connection when any address is private.
const publicLookup = (hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
   lookup(hostname, { all: true }, (error, addresses) => {
      if (error) {
         callback(error, [])

         return
      }

      const [first] = addresses

      if (!first || addresses.some(({ address }) => !isPublicAddress(address))) {
         callback(new Error(REFUSED), [])

         return
      }

      if (options.all) {
         callback(null, addresses)
      } else {
         callback(null, first.address, first.family)
      }
   })
}

export const httpsPost: Post = (url, body, headers) =>
   new Promise((resolve, reject) => {
      const target = new URL(url)
      const host = target.hostname.replace(/^\[|\]$/g, '')

      if (target.protocol !== 'https:') {
         reject(new Error('the address must start with https://'))

         return
      }

      if (isIP(host) !== 0 && !isPublicAddress(host)) {
         reject(new Error(REFUSED))

         return
      }

      const sent = request(
         target,
         {
            method: 'POST',
            headers: {
               ...headers,
               'content-type': 'application/json',
               'content-length': String(Buffer.byteLength(body)),
            },
            timeout: TIMEOUT_MS,
            lookup: publicLookup,
         },
         response => {
            response.resume()
            response.on('end', () => resolve({ status: response.statusCode ?? 0 }))
         }
      )

      sent.on('timeout', () => sent.destroy(new Error('no answer within 10 seconds')))
      sent.on('error', reject)
      sent.end(body)
   })

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

type Target = { url: string; secret: string; post?: Post; sleep?: (ms: number) => Promise<unknown> }

// Sends the items in pages of 1,000, each tried up to three times. The secret is only ever put in the header.
export const sendPages = async (
   { url, secret, post = httpsPost, sleep = wait }: Target,
   meta: { workflowId: string; runId: string },
   items: WorkflowItemData[]
) => {
   const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
   const headers: Record<string, string> = secret ? { 'x-workflow-secret': secret } : {}
   let failed = 0
   let lastError: string | null = null

   for (let page = 0; page < pages; page += 1) {
      const body = JSON.stringify({
         ...meta,
         page: page + 1,
         pages,
         items: items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
      })
      let delivered = false

      for (let attempt = 0; attempt <= BACKOFF_MS.length && !delivered; attempt += 1) {
         if (attempt > 0) {
            await sleep(BACKOFF_MS[attempt - 1])
         }

         try {
            const { status } = await post(url, body, headers)

            delivered = status >= 200 && status < 300
            lastError = delivered ? lastError : `it answered ${status}`
         } catch (error) {
            lastError = error instanceof Error ? error.message : 'no answer'
         }
      }

      failed += delivered ? 0 : 1
   }

   return {
      pages,
      failed,
      error: lastError,
   }
}
