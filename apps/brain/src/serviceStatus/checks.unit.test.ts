import { type Server, createServer } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { httpCheck, smtpCheck, workerReport } from './checks'

const fetchMock = vi.fn()

beforeEach(() => {
   fetchMock.mockReset()
   vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
   vi.unstubAllGlobals()
})

const answer = (status: number, body: unknown = {}) =>
   ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
   }) as Response

const timeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })

describe('httpCheck', () => {
   it('should be live when the address answers with a success', async () => {
      fetchMock.mockResolvedValue(answer(200))

      await expect(httpCheck('http://body:80/health')()).resolves.toEqual({ state: 'live' })
      expect(fetchMock).toHaveBeenCalledWith(
         'http://body:80/health',
         expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
   })

   it.each([500, 503, 404, 401])('should be dead, reporting an error, when it answers %i', async status => {
      fetchMock.mockResolvedValue(answer(status))

      await expect(httpCheck('http://x/health')()).resolves.toEqual({
         state: 'dead',
         reason: 'Reports an error',
      })
   })

   it('should be dead and not answering when the connection is refused', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'))

      await expect(httpCheck('http://x/health')()).resolves.toEqual({
         state: 'dead',
         reason: 'Not answering',
      })
   })

   it('should be dead and timed out when it takes too long', async () => {
      fetchMock.mockRejectedValue(timeout())

      await expect(httpCheck('http://x/health')()).resolves.toEqual({
         state: 'dead',
         reason: 'Timed out',
      })
   })

   it('should send the headers it is given, and never put them or the address in the result', async () => {
      fetchMock.mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.5:80 token=SECRET'))

      const result = await httpCheck('http://10.0.0.5/x', { authorization: 'Bearer SECRET' })()

      expect(fetchMock.mock.calls[0][1].headers).toEqual({ authorization: 'Bearer SECRET' })
      expect(JSON.stringify(result)).not.toMatch(/SECRET|10\.0\.0\.5/)
   })
})

describe('workerReport', () => {
   const report = {
      broker: 'up',
      consuming: true,
      storage: 'up',
   }

   it('should read what the worker says about itself', async () => {
      fetchMock.mockResolvedValue(answer(200, report))

      await expect(workerReport('http://spider-worker:3003/health')()).resolves.toEqual({
         reachable: true,
         ...report,
      })
   })

   it('should still read the report of a worker that says it is not well (503)', async () => {
      fetchMock.mockResolvedValue(
         answer(503, {
            broker: 'down',
            consuming: false,
            storage: 'up',
         })
      )

      await expect(workerReport('http://x/health')()).resolves.toMatchObject({
         reachable: true,
         broker: 'down',
         consuming: false,
      })
   })

   it.each([
      ['a refused connection', () => fetchMock.mockRejectedValue(new TypeError('fetch failed')), 'Not answering'],
      ['a timeout', () => fetchMock.mockRejectedValue(timeout()), 'Timed out'],
      [
         'an answer that is not a report',
         () => fetchMock.mockResolvedValue(answer(200, { hello: 'world' })),
         'Reports an error',
      ],
      [
         'an answer that is not JSON',
         () =>
            fetchMock.mockResolvedValue({
               ok: true,
               status: 200,
               json: async () => Promise.reject(new Error('x')),
            }),
         'Reports an error',
      ],
   ])('should say the worker is not reachable on %s', async (_name, arrange, reason) => {
      arrange()

      await expect(workerReport('http://x/health')()).resolves.toEqual({
         reachable: false,
         reason,
      })
   })

   it('should ask the worker once for two callers that arrive together', async () => {
      fetchMock.mockResolvedValue(answer(200, report))

      const read = workerReport('http://x/health')

      await Promise.all([read(), read()])

      expect(fetchMock).toHaveBeenCalledTimes(1)
   })

   it('should ask again once the first answer is in', async () => {
      fetchMock.mockResolvedValue(answer(200, report))

      const read = workerReport('http://x/health')

      await read()
      await read()

      expect(fetchMock).toHaveBeenCalledTimes(2)
   })
})

describe('smtpCheck', () => {
   let server: Server
   let port: number

   const listen = async (greeting: string | null) => {
      server = createServer(socket => {
         if (greeting) {
            socket.write(greeting)
         }
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      ;({ port } = server.address() as { port: number })
   }

   afterEach(async () => {
      await new Promise(resolve => server.close(resolve))
   })

   it('should be live when the server greets with 220, without sending anything', async () => {
      await listen('220 smtp.example ESMTP ready\r\n')

      await expect(
         smtpCheck({
            host: '127.0.0.1',
            port,
            tls: false,
         })()
      ).resolves.toEqual({ state: 'live' })
   })

   it('should be dead when the server answers with something else', async () => {
      await listen('554 no service\r\n')

      await expect(
         smtpCheck({
            host: '127.0.0.1',
            port,
            tls: false,
         })()
      ).resolves.toEqual({
         state: 'dead',
         reason: 'Reports an error',
      })
   })

   it('should be dead and not answering when nothing listens', async () => {
      await listen(null)
      await new Promise(resolve => server.close(resolve))
      server = createServer()
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

      await expect(
         smtpCheck({
            host: '127.0.0.1',
            port,
            tls: false,
         })()
      ).resolves.toEqual({
         state: 'dead',
         reason: 'Not answering',
      })
   })

   it('should be dead and timed out when the server never greets', async () => {
      await listen(null)

      await expect(
         smtpCheck({
            host: '127.0.0.1',
            port,
            tls: false,
            timeoutMs: 100,
         })()
      ).resolves.toEqual({
         state: 'dead',
         reason: 'Timed out',
      })
   })
})
