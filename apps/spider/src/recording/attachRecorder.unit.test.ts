import { describe, expect, it, vi } from 'vitest'

import { attachRecorder } from './attachRecorder'

const setup = () => {
   const handlers: Record<string, (arg?: unknown) => unknown> = {}
   const page = {
      on: vi.fn((event: string, handler: (arg?: unknown) => unknown) => {
         handlers[event] = handler
      }),
   }
   const recorder = {
      videoDir: undefined,
      videoSize: undefined,
      log: vi.fn(),
      network: vi.fn(),
      track: vi.fn(),
      settle: vi.fn(),
   }

   attachRecorder(page as never, recorder)

   return {
      handlers,
      recorder,
   }
}

const makeResponse = (
   overrides: { type?: string; contentType?: string; length?: number; text?: () => Promise<string> } = {}
) => {
   const request = {
      method: () => 'POST',
      url: () => 'https://www.linkedin.com/uas/login-submit',
      resourceType: () => overrides.type ?? 'document',
      allHeaders: async () => ({ cookie: 'li_at=SECRET' }),
      headers: () => ({}),
   }

   return {
      request: () => request,
      status: () => 200,
      allHeaders: async () => ({
         'content-type': overrides.contentType ?? 'text/html',
         ...(overrides.length !== undefined && { 'content-length': String(overrides.length) }),
      }),
      headers: () => ({}),
      text: overrides.text ?? (async () => '<html>hello</html>'),
   }
}

describe('attachRecorder', () => {
   it('should note what the page writes to its console and its errors, as coming from the browser', () => {
      const { handlers, recorder } = setup()

      handlers.console({
         type: () => 'error',
         text: () => 'boom',
      })
      handlers.console({
         type: () => 'warning',
         text: () => 'careful',
      })
      handlers.console({
         type: () => 'log',
         text: () => 'hello',
      })
      handlers.pageerror(new Error('Uncaught TypeError'))

      expect(recorder.log.mock.calls).toEqual([
         ['browser', 'error', 'boom'],
         ['browser', 'warn', 'careful'],
         ['browser', 'info', 'hello'],
         ['browser', 'error', 'Uncaught TypeError'],
      ])
   })

   it('should note a crashed page and a failed request as coming from the browser engine', () => {
      const { handlers, recorder } = setup()

      handlers.crash()
      handlers.requestfailed({
         method: () => 'GET',
         url: () => 'https://www.linkedin.com/x',
         resourceType: () => 'script',
         headers: () => ({ accept: '*/*' }),
         failure: () => ({ errorText: 'net::ERR_ABORTED' }),
      })

      expect(recorder.log).toHaveBeenCalledWith('engine', 'error', expect.stringContaining('crashed'))
      expect(recorder.log).toHaveBeenCalledWith('engine', 'warn', expect.stringContaining('net::ERR_ABORTED'))
      expect(recorder.network).toHaveBeenCalledWith(
         expect.objectContaining({
            method: 'GET',
            status: null,
            failure: 'net::ERR_ABORTED',
         })
      )
   })

   it('should never read the body of a stream, which would wait for ever, but still note the response', async () => {
      const { handlers, recorder } = setup()
      const text = vi.fn(() => new Promise<string>(() => undefined))

      handlers.response(
         makeResponse({
            type: 'fetch',
            contentType: 'text/event-stream',
            text,
         })
      )
      await recorder.track.mock.calls[0][0]

      expect(text).not.toHaveBeenCalled()
      expect(recorder.network).toHaveBeenCalledWith(expect.not.objectContaining({ body: expect.anything() }))
   })

   it('should not read a body that says it is larger than the record keeps, but still note the response', async () => {
      const { handlers, recorder } = setup()
      const text = vi.fn(async () => 'x')

      handlers.response(
         makeResponse({
            type: 'fetch',
            contentType: 'application/json',
            length: 5_000_000,
            text,
         })
      )
      await recorder.track.mock.calls[0][0]

      expect(text).not.toHaveBeenCalled()
      expect(recorder.network).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }))
   })

   it('should stop reading bodies once the record has all it keeps, so the browser is not asked for what is thrown away', async () => {
      const { handlers, recorder } = setup()
      const big = 'x'.repeat(200_000)
      const text = vi.fn(async () => big)

      for (let count = 0; count < 40; count += 1) {
         handlers.response(
            makeResponse({
               type: 'fetch',
               contentType: 'application/json',
               text,
            })
         )
         await recorder.track.mock.calls[count][0]
      }

      // The record keeps 64 KB of each body and 2 MB in all: 32 bodies.
      expect(text).toHaveBeenCalledTimes(32)
   })

   it('should hand every response to the recorder to finish before the run is saved', async () => {
      const { handlers, recorder } = setup()

      handlers.response(makeResponse())

      expect(recorder.track).toHaveBeenCalledTimes(1)

      await recorder.track.mock.calls[0][0]

      expect(recorder.network).toHaveBeenCalledWith({
         method: 'POST',
         url: 'https://www.linkedin.com/uas/login-submit',
         resourceType: 'document',
         requestHeaders: { cookie: 'li_at=SECRET' },
         status: 200,
         responseHeaders: { 'content-type': 'text/html' },
         body: '<html>hello</html>',
         durationMs: expect.any(Number),
      })
   })

   it('should keep the text of pages and fetch calls only', async () => {
      const { handlers, recorder } = setup()

      handlers.response(
         makeResponse({
            type: 'image',
            contentType: 'image/png',
         })
      )
      handlers.response(
         makeResponse({
            type: 'script',
            contentType: 'text/javascript',
         })
      )
      handlers.response(
         makeResponse({
            type: 'fetch',
            contentType: 'application/json',
         })
      )
      handlers.response(
         makeResponse({
            type: 'document',
            contentType: 'application/pdf',
         })
      )

      await Promise.all(recorder.track.mock.calls.map(([work]) => work))

      expect(
         Object.fromEntries(recorder.network.mock.calls.map(([entry]) => [entry.resourceType, entry.body]))
      ).toEqual({
         image: undefined,
         script: undefined,
         fetch: '<html>hello</html>',
         document: undefined,
      })
   })

   it('should still record the request when the body cannot be read, as with a redirect', async () => {
      const { handlers, recorder } = setup()

      handlers.response(makeResponse({ text: async () => Promise.reject(new Error('no body for redirect')) }))
      await recorder.track.mock.calls[0][0]

      expect(recorder.network).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }))
      expect(recorder.network.mock.calls[0][0].body).toBeUndefined()
   })

   it('should never throw into the page when the recorder cannot capture a response', async () => {
      const { handlers, recorder } = setup()

      recorder.network.mockImplementation(() => {
         throw new Error('full')
      })
      handlers.response(makeResponse())

      await expect(recorder.track.mock.calls[0][0]).resolves.toBeUndefined()
   })
})
