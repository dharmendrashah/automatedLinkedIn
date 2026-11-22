import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
   generateOpenApiDocument: vi.fn(),
   existsSync: vi.fn(),
   readFileSync: vi.fn(),
}))

vi.mock('@automatedLinkedIn/trpc-openapi', () => ({ generateOpenApiDocument: mocks.generateOpenApiDocument }))

vi.mock('trpc/api/router', () => ({ appRouter: { _def: { procedures: {} } } }))

vi.mock('trpc/openApiOptions', () => ({
   openApiOptions: () => ({
      title: 'test',
      version: '1',
   }),
}))

vi.mock('fs', () => ({
   existsSync: mocks.existsSync,
   readFileSync: mocks.readFileSync,
}))

const createApp = () => {
   const routes = new Map<string, (request: unknown, response: unknown) => unknown>()

   const app = {
      get: vi.fn((path: string, handler: (request: unknown, response: unknown) => unknown) => {
         routes.set(path, handler)
      }),
   }

   const call = (path: string) => {
      const response = {
         json: vi.fn(),
         type: vi.fn(function (this: typeof response) {
            return this
         }),
         send: vi.fn(),
      }

      routes.get(path)?.({}, response)

      return response
   }

   return {
      app,
      call,
   }
}

const load = async () => (await import('./openApiDocs')).OpenApiDocs

describe('OpenApiDocs', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      vi.resetModules()
   })

   it('serves the pre-built file when it exists, read once and cached', async () => {
      const doc = {
         openapi: '3.1.0',
         fromFile: true,
      }
      mocks.existsSync.mockReturnValue(true)
      mocks.readFileSync.mockReturnValue(JSON.stringify(doc))

      const OpenApiDocs = await load()
      const { app, call } = createApp()

      OpenApiDocs.config(app as never)

      expect(call('/api/openapi.json').json).toHaveBeenCalledWith(doc)
      call('/api/openapi.json')
      expect(mocks.readFileSync).toHaveBeenCalledTimes(1)
      expect(mocks.generateOpenApiDocument).not.toHaveBeenCalled()
   })

   it('falls back to building it live when the file is missing, built once and cached', async () => {
      const doc = {
         openapi: '3.1.0',
         live: true,
      }
      mocks.existsSync.mockReturnValue(false)
      mocks.generateOpenApiDocument.mockReturnValue(doc)

      const OpenApiDocs = await load()
      const { app, call } = createApp()

      OpenApiDocs.config(app as never)

      expect(call('/api/openapi.json').json).toHaveBeenCalledWith(doc)
      call('/api/openapi.json')
      expect(mocks.generateOpenApiDocument).toHaveBeenCalledTimes(1)
      expect(mocks.readFileSync).not.toHaveBeenCalled()
   })

   it('serves an HTML page pointed at the JSON route', async () => {
      mocks.existsSync.mockReturnValue(false)
      mocks.generateOpenApiDocument.mockReturnValue({})

      const OpenApiDocs = await load()
      const { app, call } = createApp()

      OpenApiDocs.config(app as never)

      const response = call('/api/docs')

      expect(response.type).toHaveBeenCalledWith('html')
      expect(response.send).toHaveBeenCalledWith(expect.stringContaining('/api/openapi.json'))
   })
})
