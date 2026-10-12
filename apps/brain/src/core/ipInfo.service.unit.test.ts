import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import { request as httpRequest } from 'node:http'
import * as https from 'node:https'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IpInfoError, IpInfoService } from './ipInfo.service'

vi.mock('env', () => ({ IPINFO_TOKEN: 'test-ipinfo-token' }))

// Wraps the real https.get so a test can see the options it was called with.
vi.mock('node:https', async importOriginal => {
   const actual = await importOriginal<typeof https>()

   return {
      ...actual,
      get: vi.fn(actual.get),
   }
})

describe('a proxy that re-signs secure websites', () => {
   it('should not stop the lookup: the proxy certificate is accepted, as the owner decided', async () => {
      await expect(
         IpInfoService.lookupThroughProxy('http://127.0.0.1:1', 'https://api.ipinfo.io/lite/me')
      ).rejects.toThrow(IpInfoError)

      expect(https.get).toHaveBeenCalledWith(
         'https://api.ipinfo.io/lite/me',
         expect.objectContaining({ rejectUnauthorized: false }),
         expect.any(Function)
      )
   })

   it('should report a connection failure with its original reason', async () => {
      await expect(
         IpInfoService.lookupThroughProxy('http://127.0.0.1:1', 'https://api.ipinfo.io/lite/me')
      ).rejects.toThrow('could not reach ipinfo.io through the proxy')
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
         latencyMs: expect.any(Number),
         exchange: expect.any(Object),
      })
   })

   it('should report how long the answer took, in whole milliseconds', async () => {
      target = await startTarget((_req, res) => {
         setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
               JSON.stringify({
                  ip: '34.47.216.69',
                  country_code: 'US',
                  country: 'United States',
               })
            )
         }, 150)
      })
      proxy = await startProxy()

      const { latencyMs } = await IpInfoService.lookupThroughProxy(
         `http://127.0.0.1:${proxy.port}`,
         `http://127.0.0.1:${target.port}/lite/me`
      )

      expect(Number.isInteger(latencyMs)).toBe(true)
      expect(latencyMs).toBeGreaterThanOrEqual(140)
      expect(latencyMs).toBeLessThan(5000)
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

   describe('the recorded exchange', () => {
      const lookup = () =>
         IpInfoService.lookupThroughProxy(`http://127.0.0.1:${proxy.port}`, `http://127.0.0.1:${target.port}/lite/me`)

      const caught = async () => {
         try {
            await lookup()
         } catch (error) {
            return error as IpInfoError
         }

         throw new Error('expected the lookup to fail')
      }

      it('should record what was sent and what came back, for a good lookup', async () => {
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

         const { exchange, latencyMs } = await lookup()

         expect(exchange.request).toMatchObject({
            method: 'GET',
            url: `http://127.0.0.1:${target.port}/lite/me`,
            body: null,
         })
         expect(exchange.request.headers.host).toBe(`127.0.0.1:${target.port}`)
         expect(exchange.response).toMatchObject({
            status: 200,
            truncated: false,
         })
         expect(exchange.response?.headers['content-type']).toBe('application/json')
         expect(JSON.parse(exchange.response?.body ?? '')).toMatchObject({ country_code: 'US' })
         expect(exchange.elapsedMs).toBe(latencyMs)
      })

      it('should never record the token, only that one was sent', async () => {
         target = await startTarget((_req, res) => {
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

         const { exchange } = await lookup()

         expect(exchange.request.headers.authorization).toBe('Bearer ***')
         expect(JSON.stringify(exchange)).not.toContain('test-ipinfo-token')
      })

      it('should mask cookies the proxy or ipinfo.io sets, by header name', async () => {
         target = await startTarget((_req, res) => {
            res.writeHead(200, {
               'Content-Type': 'application/json',
               'Set-Cookie': ['session=TOPSECRETCOOKIE; Path=/', 'other=ALSOSECRET'],
            })
            res.end(
               JSON.stringify({
                  ip: '1.2.3.4',
                  country_code: 'US',
                  country: 'United States',
               })
            )
         })
         proxy = await startProxy()

         const { exchange } = await lookup()

         expect(exchange.response?.headers['set-cookie']).toBe('***')
         expect(JSON.stringify(exchange)).not.toContain('TOPSECRETCOOKIE')
      })

      it('should keep the response of a failed lookup, status and body included', async () => {
         target = await startTarget((_req, res) => {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'bad token' }))
         })
         proxy = await startProxy()

         const error = await caught()

         expect(error.exchange?.response).toMatchObject({ status: 403 })
         expect(error.exchange?.response?.body).toContain('bad token')
      })

      it('should keep the request, and no response, when the proxy cannot be reached', async () => {
         const error = await IpInfoService.lookupThroughProxy('http://127.0.0.1:1', 'http://127.0.0.1:1/lite/me').then(
            () => undefined,
            (rejected: IpInfoError) => rejected
         )

         expect(error?.exchange?.request.method).toBe('GET')
         expect(error?.exchange?.response).toBeNull()
         expect(error?.exchange?.elapsedMs).toBeGreaterThanOrEqual(0)
      })

      it('should cut a big response body at 64 KB and say so', async () => {
         target = await startTarget((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end('a'.repeat(100_000))
         })
         proxy = await startProxy()

         const error = await caught()

         expect(error.exchange?.response?.truncated).toBe(true)
         expect(error.exchange?.response?.body).toHaveLength(65_536)
      })
   })
})
