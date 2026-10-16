import { type AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'

import { type ConsumerState } from '../consumers/consumerRunner'
import { type HealthSources, createHealthReader, listenHealth } from './workerHealth'

const consumer = (connected: boolean): ConsumerState => ({
   name: 'task-results',
   queue: 'tasks.done',
   connected,
   lastHandledAt: null,
   handled: 0,
   failed: 0,
   failureStreak: 0,
   deadLettered: 0,
})

const sources = (overrides: Partial<HealthSources> = {}): HealthSources => ({
   consumers: () => [consumer(true)],
   jobs: () => [],
   isDatabaseHealthy: async () => true,
   isBrokerHealthy: async () => true,
   deadLetters: async () => [],
   taskDispatch: async () => ({
      waiting: 0,
      oldestSeconds: 0,
   }),
   build: {
      commit: 'abc1234',
      builtAt: '2026-10-16T10:00:00Z',
   },
   ...overrides,
})

describe('createHealthReader', () => {
   it('should be healthy when the database answers and every consumer is connected', async () => {
      const { ok, body } = await createHealthReader(sources())()

      expect(ok).toBe(true)
      expect(body).toMatchObject({
         status: 'ok',
         service: 'brain-worker',
         commit: 'abc1234',
         database: 'up',
         broker: 'up',
      })
   })

   it('should not be healthy while the database is down', async () => {
      const { ok, body } = await createHealthReader(sources({ isDatabaseHealthy: async () => false }))()

      expect(ok).toBe(false)
      expect(body.database).toBe('down')
   })

   it('should not be healthy while a consumer is not connected', async () => {
      const { ok } = await createHealthReader(sources({ consumers: () => [consumer(true), consumer(false)] }))()

      expect(ok).toBe(false)
   })

   it('should stay healthy with a broker that is down when it runs no consumers', async () => {
      const { ok, body } = await createHealthReader(
         sources({
            consumers: () => [],
            isBrokerHealthy: async () => false,
         })
      )()

      expect(ok).toBe(true)
      expect(body.broker).toBe('down')
   })

   it('should report dead letters but treat a failing count as none', async () => {
      const withDead = await createHealthReader(
         sources({
            deadLetters: async () => [
               {
                  queue: 'tasks.done.dead',
                  messages: 2,
               },
            ],
         })
      )()
      const failing = await createHealthReader(
         sources({
            deadLetters: async () => {
               throw new Error('channel closed')
            },
         })
      )()

      expect(withDead.body.deadLetters).toEqual([
         {
            queue: 'tasks.done.dead',
            messages: 2,
         },
      ])
      expect(withDead.ok).toBe(true)
      expect(failing.body.deadLetters).toEqual([])
   })

   it('should report the tasks waiting to be published without making the worker unhealthy', async () => {
      const { ok, body } = await createHealthReader(
         sources({
            taskDispatch: async () => ({
               waiting: 4,
               oldestSeconds: 95,
            }),
         })
      )()

      expect(body.taskDispatch).toEqual({
         waiting: 4,
         oldestSeconds: 95,
      })
      expect(ok).toBe(true)
   })

   it('should report none waiting when the count cannot be read, instead of failing the report', async () => {
      const { body } = await createHealthReader(
         sources({
            taskDispatch: async () => {
               throw new Error('relation does not exist')
            },
         })
      )()

      expect(body.taskDispatch).toEqual({
         waiting: 0,
         oldestSeconds: 0,
      })
   })

   it('should answer from its cache for a few seconds', async () => {
      const isDatabaseHealthy = vi.fn().mockResolvedValue(true)
      const read = createHealthReader(sources({ isDatabaseHealthy }))

      await read(1000)
      await read(2000)
      await read(7000)

      expect(isDatabaseHealthy).toHaveBeenCalledTimes(2)
   })
})

describe('listenHealth', () => {
   const serve = async (ok: boolean) => {
      const server = await listenHealth(
         async () => ({
            ok,
            body: { status: ok ? 'ok' : 'error' },
         }),
         0
      )
      const { port } = server.address() as AddressInfo

      return {
         url: `http://127.0.0.1:${port}`,
         close: () => new Promise<void>(resolve => server.close(() => resolve())),
      }
   }

   it('should answer GET /health with the report, 200 when healthy and 503 when not', async () => {
      const healthy = await serve(true)
      const unhealthy = await serve(false)

      try {
         const good = await fetch(`${healthy.url}/health`)
         const bad = await fetch(`${unhealthy.url}/health`)

         expect(good.status).toBe(200)
         expect(good.headers.get('cache-control')).toBe('no-store')
         await expect(good.json()).resolves.toEqual({ status: 'ok' })
         expect(bad.status).toBe(503)
      } finally {
         await healthy.close()
         await unhealthy.close()
      }
   })

   it('should answer 404 to anything else', async () => {
      const { url, close } = await serve(true)

      try {
         expect((await fetch(`${url}/`)).status).toBe(404)
         expect((await fetch(`${url}/health`, { method: 'POST' })).status).toBe(404)
      } finally {
         await close()
      }
   })
})
