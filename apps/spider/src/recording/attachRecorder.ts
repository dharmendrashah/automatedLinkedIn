import { type ConsoleMessage, type Page, type Request, type Response } from 'playwright-core'

import { type LogLevel, type RunRecorder } from './recorder'

// Only pages and fetch/XHR carry text worth reading; scripts, styles, images and fonts would only fill the record.
const TEXT_TYPES = new Set(['document', 'xhr', 'fetch'])
const TEXT_CONTENT = /text|json|xml/i

const levelOf = (type: ConsoleMessage['type'] extends () => infer T ? T : string): LogLevel => {
   if (type === 'error') {
      return 'error'
   }

   return type === 'warning' ? 'warn' : 'info'
}

const requestHeaders = async (request: Request) => {
   try {
      return await request.allHeaders()
   } catch {
      return request.headers()
   }
}

const responseHeaders = async (response: Response) => {
   try {
      return await response.allHeaders()
   } catch {
      return response.headers()
   }
}

// Hooks a recorder into a page: console and page errors become browser logs, crashes and failed requests become
// engine logs, and every response becomes a network entry. Nothing here can throw into the page.
export const attachRecorder = (page: Page, recorder: RunRecorder) => {
   const started = new WeakMap<Request, number>()

   const capture = async (response: Response) => {
      try {
         const request = response.request()
         const type = request.resourceType()
         const headers = await responseHeaders(response)
         let body: string | undefined

         if (TEXT_TYPES.has(type) && TEXT_CONTENT.test(headers['content-type'] ?? '')) {
            // A redirect or a closed page has no body to read.
            body = await response.text().catch(() => undefined)
         }

         recorder.network({
            method: request.method(),
            url: request.url(),
            resourceType: type,
            requestHeaders: await requestHeaders(request),
            status: response.status(),
            responseHeaders: headers,
            ...(body !== undefined && { body }),
            durationMs: Math.round(performance.now() - (started.get(request) ?? performance.now())),
         })
      } catch {
         // A recording problem is not the run's problem.
      }
   }

   page.on('request', request => started.set(request, performance.now()))
   page.on('console', message => recorder.log('browser', levelOf(message.type()), message.text()))
   page.on('pageerror', error => recorder.log('browser', 'error', error.message))
   page.on('crash', () => recorder.log('engine', 'error', 'The browser page crashed'))
   page.on('requestfailed', request => {
      const reason = request.failure()?.errorText ?? 'unknown reason'

      recorder.log('engine', 'warn', `Request failed: ${request.method()} ${request.url()} (${reason})`)
      recorder.network({
         method: request.method(),
         url: request.url(),
         resourceType: request.resourceType(),
         requestHeaders: request.headers(),
         status: null,
         responseHeaders: {},
         failure: reason,
         durationMs: Math.round(performance.now() - (started.get(request) ?? performance.now())),
      })
   })
   page.on('response', response => recorder.track(capture(response)))
}
