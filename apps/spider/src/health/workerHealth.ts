import { type Server, createServer } from 'node:http'

// A bucket read longer than this is a bucket that is not answering.
const STORAGE_TIMEOUT_MS = 3000

// The bucket is read at most this often, however many times the status page asks.
const STORAGE_TTL_MS = 30_000

export type WorkerReport = {
   status: 'ok' | 'error'
   broker: 'up' | 'down'
   consuming: boolean
   storage: 'up' | 'down'
}

type Deps = {
   brokerIsUp: () => Promise<boolean>
   // Both consumers (scrape tasks and account checks) are registered.
   isConsuming: () => boolean
   checkStorage: () => Promise<boolean>
}

// What the Service status page reads from the worker. It never holds a path, a name or the text of an error.
export const createWorkerHealth = ({ brokerIsUp, isConsuming, checkStorage }: Deps) => {
   let stored: { at: number; up: boolean } | undefined
   let reading: Promise<boolean> | undefined

   const storageIsUp = async () => {
      if (stored && Date.now() - stored.at < STORAGE_TTL_MS) {
         return stored.up
      }

      reading ??= (async () => {
         let timer: NodeJS.Timeout | undefined

         try {
            return await Promise.race([
               checkStorage(),
               new Promise<boolean>(resolve => {
                  timer = setTimeout(() => resolve(false), STORAGE_TIMEOUT_MS)
               }),
            ])
         } catch {
            return false
         } finally {
            clearTimeout(timer)
         }
      })().then(up => {
         stored = {
            at: Date.now(),
            up,
         }
         reading = undefined

         return up
      })

      return reading
   }

   return async (): Promise<{ code: number; body: WorkerReport }> => {
      const [broker, storage] = await Promise.all([brokerIsUp().catch(() => false), storageIsUp()])
      const consuming = isConsuming()
      const ok = broker && consuming

      return {
         code: ok ? 200 : 503,
         body: {
            status: ok ? 'ok' : 'error',
            broker: broker ? 'up' : 'down',
            consuming,
            storage: storage ? 'up' : 'down',
         },
      }
   }
}

// Node's own http: the worker has no web framework, and one read-only route does not need one.
export const startHealthServer = (
   port: number,
   handler: () => Promise<{ code: number; body: WorkerReport }>,
   host = '0.0.0.0'
): Server => {
   const server = createServer((request, response) => {
      if (request.method !== 'GET' || request.url !== '/health') {
         response.writeHead(404)
         response.end()

         return
      }

      handler()
         .then(({ code, body }) => {
            response.writeHead(code, {
               'content-type': 'application/json',
               'cache-control': 'no-store',
            })
            response.end(JSON.stringify(body))
         })
         .catch(() => {
            response.writeHead(500)
            response.end()
         })
   })

   server.listen(port, host)

   return server
}
