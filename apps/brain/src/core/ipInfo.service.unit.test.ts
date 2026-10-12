import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import { request as httpRequest } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IpInfoError, IpInfoService, describeConnectionError } from './ipInfo.service'

vi.mock('env', () => ({ IPINFO_TOKEN: 'test-ipinfo-token' }))

describe('describeConnectionError', () => {
   it.each([
      ['CERT_HAS_EXPIRED', 'certificate has expired'],
      ['DEPTH_ZERO_SELF_SIGNED_CERT', 'self-signed certificate'],
      ['SELF_SIGNED_CERT_IN_CHAIN', 'self signed certificate in certificate chain'],
      ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'unable to verify the first certificate'],
      ['CERT_NOT_YET_VALID', 'certificate is not yet valid'],
      ['ERR_TLS_CERT_ALTNAME_INVALID', 'Hostname/IP does not match certificate'],
   ])('should explain %s as a proxy that re-signs secure traffic, in plain words', (code, message) => {
      const text = describeConnectionError(Object.assign(new Error(message), { code }))

      expect(text).toContain('replaces the security certificate')
      expect(text).toContain('Use a different proxy')
      expect(text).not.toContain(code)
   })

   it('should keep the original reason for any other failure', () => {
      expect(describeConnectionError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))).toBe(
         'could not reach ipinfo.io through the proxy: connect ECONNREFUSED'
      )
   })
})

// A minimal plain-HTTP forward proxy: an http-proxy-agent request line carries the absolute target URL in
// `req.url`, which a real forward proxy relays as is. Good enough to exercise ProxyAgent end to end.
function startProxy(onRequest?: (req: IncomingMessage) => void): Promise<{ server: Server; port: number }> {
   const server = createServer((req, res) => {
      onRequest?.(req)

      const target = new URL(req.url!)
      const upstream = httpRequest(
         {
            hostname: target.hostname,
            port: target.port,
            path: target.pathname + target.search,
            method: req.method,
            headers: req.headers,
         },
         upstreamRes => {
            res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
            upstreamRes.pipe(res)
         }
      )

      req.pipe(upstream)
   })

   return new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
         const address = server.address()
         resolve({
            server,
            port: typeof address === 'object' && address ? address.port : 0,
         })
      })
   })
}

function startTarget(
   respond: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{ server: Server; port: number }> {
   const server = createServer(respond)

   return new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
         const address = server.address()
         resolve({
            server,
            port: typeof address === 'object' && address ? address.port : 0,
         })
      })
   })
}

describe('IpInfoService', () => {
   let proxy: { server: Server; port: number }
   let target: { server: Server; port: number }

   afterEach(() => {
      proxy?.server.close()
      target?.server.close()
   })

   it('should return the country detected through the proxy', async () => {
      target = await startTarget((_req, res) => {
         res.writeHead(200, { 'Content-Type': 'application/json' })
         res.end(
            JSON.stringify({
               ip: '34.47.216.69',
               country_code: 'US',
               country: 'United States',
            })
         )
      })
      proxy = await startProxy()

      const result = await IpInfoService.lookupThroughProxy(
         `http://127.0.0.1:${proxy.port}`,
         `http://127.0.0.1:${target.port}/lite/me`
      )

      expect(result).toEqual({
         ip: '34.47.216.69',
         countryCode: 'US',
         country: 'United States',
      })
   })

   it('should send the token as a bearer header', async () => {
      let receivedAuth: string | undefined

      target = await startTarget((req, res) => {
         receivedAuth = req.headers.authorization
         res.writeHead(200, { 'Content-Type': 'application/json' })
         res.end(
            JSON.stringify({
               ip: '1.2.3.4',
               country_code: 'US',
               country: 'United States',
            })
         )
      })
      proxy = await startProxy()

      await IpInfoService.lookupThroughProxy(
         `http://127.0.0.1:${proxy.port}`,
         `http://127.0.0.1:${target.port}/lite/me`
      )

      expect(receivedAuth).toBe('Bearer test-ipinfo-token')
   })

   it('should reject when the target responds with a non-200 status', async () => {
      target = await startTarget((_req, res) => {
         res.writeHead(403, { 'Content-Type': 'application/json' })
         res.end(JSON.stringify({ error: 'bad token' }))
      })
      proxy = await startProxy()

      await expect(
         IpInfoService.lookupThroughProxy(`http://127.0.0.1:${proxy.port}`, `http://127.0.0.1:${target.port}/lite/me`)
      ).rejects.toThrow(IpInfoError)
   })

   it('should reject when the response body is not valid json', async () => {
      target = await startTarget((_req, res) => {
         res.writeHead(200)
         res.end('not json')
      })
      proxy = await startProxy()

      await expect(
         IpInfoService.lookupThroughProxy(`http://127.0.0.1:${proxy.port}`, `http://127.0.0.1:${target.port}/lite/me`)
      ).rejects.toThrow(IpInfoError)
   })

   it('should reject when the proxy cannot be reached', async () => {
      await expect(
         IpInfoService.lookupThroughProxy('http://127.0.0.1:1', 'http://127.0.0.1:1/lite/me')
      ).rejects.toThrow(IpInfoError)
   })
})
