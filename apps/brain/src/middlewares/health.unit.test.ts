import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Health } from './health'

const mocks = vi.hoisted(() => ({ isHealthy: vi.fn() }))

vi.mock('database', () => ({ PrismaService: { isHealthy: mocks.isHealthy } }))

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
   })

   it('should register the liveness, readiness and build info routes', () => {
      const { app, routes } = createApp()

      Health.config(app as never)

      expect([...routes.keys()]).toEqual(['/healthz', '/readyz', '/health'])
      expect(app.get).toHaveBeenCalledTimes(3)
   })

   it('should answer liveness without touching the database', async () => {
      const { app, call } = createApp()

      Health.config(app as never)

      const response = await call('/healthz')

      expect(response.statusCode).toBe(200)
      expect(response.body).toEqual({ status: 'ok' })
      expect(mocks.isHealthy).not.toHaveBeenCalled()
   })

   it('should report ready when the database answers', async () => {
      mocks.isHealthy.mockResolvedValue(true)

      const { app, call } = createApp()

      Health.config(app as never)

      const response = await call('/readyz')

      expect(response.statusCode).toBe(200)
      expect(response.body).toEqual({
         status: 'ok',
         database: 'up',
      })
   })

   it('should report unavailable when the database does not answer', async () => {
      mocks.isHealthy.mockResolvedValue(false)

      const { app, call } = createApp()

      Health.config(app as never)

      const response = await call('/readyz')

      expect(response.statusCode).toBe(503)
      expect(response.body).toEqual({
         status: 'error',
         database: 'down',
      })
   })

   it('should report unavailable when the health check throws', async () => {
      mocks.isHealthy.mockRejectedValue(new Error('connection refused'))

      const { app, call } = createApp()

      Health.config(app as never)

      const response = await call('/readyz')

      expect(response.statusCode).toBe(503)
      expect(response.body).toEqual({
         status: 'error',
         database: 'down',
      })
   })

   it('should report the commit and build time as JSON without touching the database', async () => {
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
      })
      expect(Number.isNaN(Date.parse((response.body as { startedAt: string }).startedAt))).toBe(false)
      expect(response.headers['Cache-Control']).toBe('no-store')
      expect(mocks.isHealthy).not.toHaveBeenCalled()
   })
})
