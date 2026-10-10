import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Middlewares } from './index'

const mocks = vi.hoisted(() => ({
   cors: vi.fn(() => 'cors-middleware'),
   cookieParser: vi.fn(() => 'cookie-middleware'),
   initializeTrpc: vi.fn(),
   configHealth: vi.fn(),
   env: {
      CORS_ORIGINS: ' http://localhost:3000 ,http://localhost:5173,, ',
      isProd: false,
   },
}))

vi.mock('cors', () => ({ default: mocks.cors }))

vi.mock('cookie-parser', () => ({ default: mocks.cookieParser }))

vi.mock('trpc/api/router', () => ({ initializeTrpc: mocks.initializeTrpc }))

vi.mock('./health', () => ({ Health: { config: mocks.configHealth } }))

vi.mock('env', () => mocks.env)

describe('Middlewares', () => {
   beforeEach(() => {
      vi.clearAllMocks()
   })

   it('should allow only the configured origins and the authorization header', () => {
      const app = { use: vi.fn() }

      Middlewares.config(app as never)

      expect(mocks.cors).toHaveBeenCalledWith({
         origin: ['http://localhost:3000', 'http://localhost:5173'],
         allowedHeaders: ['authorization', 'content-type'],
      })
   })

   it('should register the health routes', () => {
      const app = { use: vi.fn() }

      Middlewares.config(app as never)

      expect(mocks.configHealth).toHaveBeenCalledWith(app)
   })

   it('should register cors before the api', () => {
      const app = { use: vi.fn() }

      Middlewares.config(app as never)

      expect(app.use).toHaveBeenNthCalledWith(1, 'cors-middleware')
      expect(app.use).toHaveBeenNthCalledWith(2, 'cookie-middleware')
      expect(mocks.initializeTrpc).toHaveBeenCalledWith(app)
   })
})
