import * as http from 'node:http'
import * as https from 'node:https'
import { ProxyAgent } from 'proxy-agent'

import { IPINFO_TOKEN } from 'env'

const TIMEOUT_MS = 10_000
const SELF_LOOKUP_URL = 'https://api.ipinfo.io/lite/me'
// A proxy can answer anything, so a saved body is cut here.
const MAX_BODY_BYTES = 65_536

export type RecordedHeaders = Record<string, string>

// What was sent and what came back, for the test history. Secrets are masked before anything leaves this file.
export interface ProxyExchange {
   request: {
      method: 'GET'
      url: string
      headers: RecordedHeaders
      body: string | null
   }
   response: {
      status: number
      headers: RecordedHeaders
      body: string
      truncated: boolean
   } | null
   elapsedMs: number
}

export class IpInfoError extends Error {
   public exchange?: ProxyExchange

   public constructor(message: string, exchange?: ProxyExchange) {
      super(message)
      this.exchange = exchange
   }
}

export interface ProxyLookupResult {
   ip: string
   countryCode: string
   country: string
   // From sending the request to the full answer, through the proxy: its connection, the secure handshake and ipinfo.io.
   latencyMs: number
   exchange: ProxyExchange
}

const MASKED_HEADERS = new Set(['cookie', 'set-cookie'])
const SCHEME_HEADERS = new Set(['authorization', 'proxy-authorization'])

// By header name, not by value, so a token can never reach the history whatever it looks like.
const record = (headers: Record<string, number | string | string[] | undefined>): RecordedHeaders =>
   Object.fromEntries(
      Object.entries(headers)
         .filter((entry): entry is [string, number | string | string[]] => entry[1] !== undefined)
         .map(([name, raw]) => {
            const lower = name.toLowerCase()
            const value = Array.isArray(raw) ? raw.join(', ') : String(raw)

            if (MASKED_HEADERS.has(lower)) return [lower, '***']
            if (SCHEME_HEADERS.has(lower)) return [lower, `${value.split(' ')[0]} ***`]

            return [lower, value]
         })
   )

// Looks up the apparent public IP and country by routing the request through the given proxy, so the
// result reflects the proxy's exit address, not this server's. Never resolves without a hard timeout: a dead
// proxy must not hang whatever called it.
export class IpInfoService {
   public static async lookupThroughProxy(
      proxyServerUrl: string,
      selfLookupUrl: string = SELF_LOOKUP_URL
   ): Promise<ProxyLookupResult> {
      const agent = new ProxyAgent({ getProxyForUrl: () => proxyServerUrl })
      const client = selfLookupUrl.startsWith('https:') ? https : http

      return new Promise((resolve, reject) => {
         const startedAt = performance.now()
         const options: https.RequestOptions = {
            agent,
            timeout: TIMEOUT_MS,
            headers: { Authorization: `Bearer ${IPINFO_TOKEN}` },
            // Some proxies re-sign secure websites with a certificate of their own, sometimes an expired one. The owner
            // accepts that (.plan/proxy-accept-resigned-https.md): only the country matters here.
            rejectUnauthorized: false,
         }
         let received: ProxyExchange['response'] = null

         const request = client.get(selfLookupUrl, options, response => {
            const chunks: Buffer[] = []
            let bytes = 0

            response.on('data', (chunk: Buffer) => {
               if (bytes < MAX_BODY_BYTES) chunks.push(chunk)

               bytes += chunk.length
            })
            response.on('end', () => {
               received = {
                  status: response.statusCode ?? 0,
                  headers: record(response.headers),
                  body: Buffer.concat(chunks).subarray(0, MAX_BODY_BYTES).toString('utf8'),
                  truncated: bytes > MAX_BODY_BYTES,
               }

               if (response.statusCode !== 200) {
                  reject(new IpInfoError(`ipinfo.io responded with HTTP ${response.statusCode}`, exchange()))
                  return
               }

               try {
                  const body = JSON.parse(received.body)

                  if (typeof body.ip !== 'string' || typeof body.country_code !== 'string') {
                     reject(new IpInfoError('ipinfo.io returned an unexpected response', exchange()))
                     return
                  }

                  const done = exchange()

                  resolve({
                     ip: body.ip,
                     countryCode: body.country_code,
                     country: body.country,
                     latencyMs: done.elapsedMs,
                     exchange: done,
                  })
               } catch {
                  reject(new IpInfoError('ipinfo.io returned an unexpected response', exchange()))
               }
            })
         })

         const exchange = (): ProxyExchange => ({
            request: {
               method: 'GET',
               url: selfLookupUrl,
               headers: record({
                  host: new URL(selfLookupUrl).host,
                  ...request.getHeaders(),
               }),
               body: null,
            },
            response: received,
            elapsedMs: Math.round(performance.now() - startedAt),
         })

         request.on('timeout', () => request.destroy(new IpInfoError('timed out reaching ipinfo.io through the proxy')))
         request.on('error', error => {
            if (error instanceof IpInfoError) {
               error.exchange ??= exchange()
               reject(error)
               return
            }

            reject(new IpInfoError(`could not reach ipinfo.io through the proxy: ${error.message}`, exchange()))
         })
      })
   }
}
