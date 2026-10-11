import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Health } from './health'

const mocks = vi.hoisted(() => ({
   isHealthy: vi.fn(),
   brokerHealthy: vi.fn(),
}))

vi.mock('database', () => ({ PrismaService: { isHealthy: mocks.isHealthy } }))

vi.mock('core', () => ({ MessageBroker: { isHealthy: mocks.brokerHealthy } }))

vi.mock('env', () => ({
   GIT_SHA: 'a1b2c3d',
   BUILD_TIME: '2026-10-11T10:00:00Z',
}))

const createApp = () => {
   const routes = new Map<string, (request: unknown, response: unknown) => unknown>()

   const app = {
      get: vi.fn((path: string, handler: (request: unknown, response: unknown) => unknown) => {
         routes.set(path, handler)
      }),
   }

   const call = async (path: string) => {
      const response = {
         statusCode: 200,
         body: undefined as unknown,
         headers: {} as Record<string, string>,
         status: vi.fn(function (this: typeof response, code: number) {
            this.statusCode = code

            return this
         }),
         set: vi.fn(function (this: typeof response, name: string, value: string) {
            this.headers[name] = value

            return this
         }),
         json: vi.fn(function (this: typeof response, body: unknown) {
            this.body = body

            return this
         }),
      }

      await routes.get(path)?.({}, response)

      return response
   }

   return {
      app,
      call,
      routes,
   }
}

describe('Health', () => {
   beforeEach(() => {
      vi.clearAllMocks()
      mocks.brokerHealthy.mockResolvedValue(true)
   })

   it('should register a single health route', () => {
      const { app, routes } = createApp()

      Health.config(app as never)

      expect([...routes.keys()]).toEqual(['/health'])
      expect(app.get).toHaveBeenCalledTimes(1)
   })

   it('should report 200 with build info and the database up when the database answers', async () => {
      mocks.isHealthy.mockResolvedValue(true)

      const { app, call } = createApp()

      Health.config(app as never)

      const response = await call('/health')

      expect(response.statusCode).toBe(200)
      expect(response.body).toEqual({
         status: 'ok',
         service: 'brain',
         commit: 'a1b2c3d',
         builtAt: '2026-10-11T10:00:00Z',
         startedAt: expect.any(String),
         database: 'up',
         broker: 'up',
      })
      expect(Number.isNaN(Date.parse((response.body as { startedAt: string }).startedAt))).toBe(false)
      expect(response.headers['Cache-Control']).toBe('no-store')
   })

   it('should report 503 with the database down when the database does not answer', async () => {
      mocks.isHealthy.mockResolvedValue(false)

      const { app, call } = createApp()

      Health.config(app as never)

      const response = await call('/health')

      expect(response.statusCode).toBe(503)
      expect(response.body).toEqual({
         status: 'error',
         service: 'brain',
         commit: 'a1b2c3d',
         builtAt: '2026-10-11T10:00:00Z',
         startedAt: expect.any(String),
         database: 'down',
         broker: 'up',
      })
      expect(response.headers['Cache-Control']).toBe('no-store')
   })

   it('should report 503 when the database check throws', async () => {
      mocks.isHealthy.mockRejectedValue(new Error('connection refused'))

      const { app, call } = createApp()

      Health.config(app as never)

      const response = await call('/health')

      expect(response.statusCode).toBe(503)
      expect(response.body).toMatchObject({
         status: 'error',
         database: 'down',
      })
   })

   it('should stay ready and report the broker down when only the broker is unreachable', async () => {
      mocks.isHealthy.mockResolvedValue(true)
      mocks.brokerHealthy.mockResolvedValue(false)

      const { app, call } = createApp()

      Health.config(app as never)

      const response = await call('/health')

      expect(response.statusCode).toBe(200)
      expect(response.body).toMatchObject({
         status: 'ok',
         database: 'up',
         broker: 'down',
      })
   })

   it('should report the broker down when the broker check throws', async () => {
      mocks.isHealthy.mockResolvedValue(true)
      mocks.brokerHealthy.mockRejectedValue(new Error('boom'))

      const { app, call } = createApp()

      Health.config(app as never)

      const response = await call('/health')

      expect(response.statusCode).toBe(200)
      expect(response.body).toMatchObject({ broker: 'down' })
   })
})
