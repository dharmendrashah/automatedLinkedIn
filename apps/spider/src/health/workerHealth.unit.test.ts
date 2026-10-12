import { type Server } from 'node:http'
import { type AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkerHealth, startHealthServer } from './workerHealth'

const deps = (overrides: Record<string, unknown> = {}) => ({
   brokerIsUp: vi.fn(async () => true),
   isConsuming: vi.fn(() => true),
   checkStorage: vi.fn(async () => true),
   ...overrides,
})

describe('createWorkerHealth', () => {
   beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-10-12T12:00:00.000Z'))
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('should say ok with 200 when connected to the queue, consuming and able to read the bucket', async () => {
      const health = createWorkerHealth(deps())

      await expect(health()).resolves.toEqual({
         code: 200,
         body: {
            status: 'ok',
            broker: 'up',
            consuming: true,
            storage: 'up',
         },
      })
   })

   it.each([
      [
         'the queue is down',
         { brokerIsUp: vi.fn(async () => false) },
         {
            broker: 'down',
            consuming: true,
         },
      ],
      [
         'it is not consuming',
         { isConsuming: vi.fn(() => false) },
         {
            broker: 'up',
            consuming: false,
         },
      ],
   ])('should say error with 503 when %s, and still say what it knows', async (_name, overrides, expected) => {
      const answer = await createWorkerHealth(deps(overrides))()

      expect(answer.code).toBe(503)
      expect(answer.body).toMatchObject({
         status: 'error',
         ...expected,
      })
   })

   it('should report the bucket as down, without failing the worker, when it cannot be read', async () => {
      const answer = await createWorkerHealth(
         deps({ checkStorage: vi.fn(async () => Promise.reject(new Error('403 denied'))) })
      )()

      expect(answer.code).toBe(200)
      expect(answer.body).toMatchObject({ storage: 'down' })
      expect(JSON.stringify(answer)).not.toContain('denied')
   })

   it('should read the bucket at most once every thirty seconds, however often it is asked', async () => {
      const checkStorage = vi.fn(async () => true)
      const health = createWorkerHealth(deps({ checkStorage }))

      await health()
      await vi.advanceTimersByTimeAsync(20_000)
      await health()

      expect(checkStorage).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(11_000)
      await health()

      expect(checkStorage).toHaveBeenCalledTimes(2)
   })

   it('should read the bucket once for callers that arrive together', async () => {
      const checkStorage = vi.fn(async () => true)
      const health = createWorkerHealth(deps({ checkStorage }))

      await Promise.all([health(), health(), health()])

      expect(checkStorage).toHaveBeenCalledTimes(1)
   })

   it('should give up on a bucket read that hangs, and call the bucket down', async () => {
      const health = createWorkerHealth(deps({ checkStorage: vi.fn(() => new Promise<boolean>(() => undefined)) }))
      const pending = health()

      await vi.advanceTimersByTimeAsync(3100)

      await expect(pending).resolves.toMatchObject({ body: { storage: 'down' } })
   })
})

describe('startHealthServer', () => {
   let server: Server

   afterEach(async () => {
      await new Promise(resolve => server.close(resolve))
   })

   const start = async () => {
      server = startHealthServer(
         0,
         async () => ({
            code: 503,
            body: {
               status: 'error',
               broker: 'down',
               consuming: false,
               storage: 'up',
            },
         }),
         '127.0.0.1'
      )
      await new Promise(resolve => server.once('listening', resolve))

      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
   }

   it('should answer GET /health with the code and the report as JSON, never cached', async () => {
      const response = await fetch(`${await start()}/health`)

      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({
         status: 'error',
         broker: 'down',
         consuming: false,
         storage: 'up',
      })
   })

   it('should answer nothing else', async () => {
      const origin = await start()

      expect((await fetch(`${origin}/other`)).status).toBe(404)
      expect((await fetch(`${origin}/health`, { method: 'POST' })).status).toBe(404)
   })
})
