import * as http from 'node:http'
import * as https from 'node:https'
import { ProxyAgent } from 'proxy-agent'

import { IPINFO_TOKEN } from 'env'

const TIMEOUT_MS = 10_000
const SELF_LOOKUP_URL = 'https://api.ipinfo.io/lite/me'

export class IpInfoError extends Error {}

export interface ProxyLookupResult {
   ip: string
   countryCode: string
   country: string
}

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
         const options: https.RequestOptions = {
            agent,
            timeout: TIMEOUT_MS,
            headers: { Authorization: `Bearer ${IPINFO_TOKEN}` },
            // Some proxies re-sign secure websites with a certificate of their own, sometimes an expired one. The owner
            // accepts that (.plan/proxy-accept-resigned-https.md): only the country matters here.
            rejectUnauthorized: false,
         }
         const request = client.get(selfLookupUrl, options, response => {
            const chunks: Buffer[] = []

            response.on('data', (chunk: Buffer) => chunks.push(chunk))
            response.on('end', () => {
               if (response.statusCode !== 200) {
                  reject(new IpInfoError(`ipinfo.io responded with HTTP ${response.statusCode}`))
                  return
               }

               try {
                  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))

                  if (typeof body.ip !== 'string' || typeof body.country_code !== 'string') {
                     reject(new IpInfoError('ipinfo.io returned an unexpected response'))
                     return
                  }

                  resolve({
                     ip: body.ip,
                     countryCode: body.country_code,
                     country: body.country,
                  })
               } catch {
                  reject(new IpInfoError('ipinfo.io returned an unexpected response'))
               }
            })
         })

         request.on('timeout', () => request.destroy(new IpInfoError('timed out reaching ipinfo.io through the proxy')))
         request.on('error', error => {
            if (error instanceof IpInfoError) {
               reject(error)
               return
            }

            reject(new IpInfoError(`could not reach ipinfo.io through the proxy: ${error.message}`))
         })
      })
   }
}
