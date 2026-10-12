import { connect as netConnect } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { z } from 'zod'

import { CHECK_TIMEOUT_MS, type CheckResult, REASONS, dead, live } from './types'

const isTimeout = (error: unknown) => (error as { name?: string } | null)?.name === 'TimeoutError'

const failure = (error: unknown) => dead(isTimeout(error) ? REASONS.timedOut : REASONS.notAnswering)

// Live when the address answers with a success. Only the fixed reasons leave this file.
export const httpCheck = (url: string, headers?: Record<string, string>) => async (): Promise<CheckResult> => {
   try {
      const response = await fetch(url, {
         signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
         ...(headers && { headers }),
      })

      return response.ok ? live() : dead(REASONS.error)
   } catch (error) {
      return failure(error)
   }
}

const reportSchema = z.object({
   broker: z.enum(['up', 'down']),
   consuming: z.boolean(),
   storage: z.enum(['up', 'down']),
})

export type WorkerReport = ({ reachable: true } & z.infer<typeof reportSchema>) | { reachable: false; reason: string }

// What the spider worker says about itself. Two modules (the worker and cloud storage) read it, and callers that arrive
// together share one request.
export const workerReport = (url: string) => {
   let pending: Promise<WorkerReport> | undefined

   const read = async (): Promise<WorkerReport> => {
      const unreadable: WorkerReport = {
         reachable: false,
         reason: REASONS.error,
      }
      let response: Response

      try {
         response = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
      } catch (error) {
         return {
            reachable: false,
            reason: failure(error).reason as string,
         }
      }

      try {
         // A worker that is not well answers 503 with the same report, which says what is wrong.
         const parsed = reportSchema.safeParse(await response.json())

         return parsed.success
            ? {
                 reachable: true,
                 ...parsed.data,
              }
            : unreadable
      } catch {
         return unreadable
      }
   }

   return () => {
      pending ??= read().finally(() => {
         pending = undefined
      })

      return pending
   }
}

type SmtpTarget = {
   host: string
   port: number
   tls: boolean
   timeoutMs?: number
}

// Connects and reads the server's greeting (220). Nothing is sent, so no mail goes out and no key is used.
export const smtpCheck =
   ({ host, port, tls, timeoutMs = CHECK_TIMEOUT_MS }: SmtpTarget) =>
   () =>
      new Promise<CheckResult>(resolve => {
         const socket = tls
            ? tlsConnect({
                 host,
                 port,
                 servername: host,
              })
            : netConnect({
                 host,
                 port,
              })

         const finish = (result: CheckResult) => {
            socket.destroy()
            resolve(result)
         }

         socket.setTimeout(timeoutMs)
         socket.once('data', data => finish(data.toString('utf8').startsWith('220') ? live() : dead(REASONS.error)))
         socket.once('timeout', () => finish(dead(REASONS.timedOut)))
         socket.once('error', () => finish(dead(REASONS.notAnswering)))
      })
