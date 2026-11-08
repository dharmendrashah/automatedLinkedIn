import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import pino, { type DestinationStream } from 'pino'

import { type Event, type Level, buildEvent, fitToLimit } from './event'

type Context = { correlationId: string }

const store = new AsyncLocalStorage<Context>()

export const withCorrelation = <T>(correlationId: string, run: () => T): T => store.run({ correlationId }, run)

export const currentCorrelationId = (): string | undefined => store.getStore()?.correlationId

const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/

export const isCorrelationId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value)

export type LogFields = Record<string, unknown>

export type Logger = {
   debug: (message: string, fields?: LogFields) => void
   info: (message: string, fields?: LogFields) => void
   warn: (message: string, fields?: LogFields) => void
   error: (message: string, fields?: LogFields) => void
   fatal: (message: string, fields?: LogFields) => void
   flush: () => void
}

export type LoggerOptions = {
   service: string
   stream?: DestinationStream
   now?: () => Date
}

const DROP_WINDOW_MS = 60_000

// pino sets severity from its level label; the event's own severity is removed before the write.
const PINO_SEVERITY: Record<string, string> = {
   trace: 'DEBUG',
   debug: 'DEBUG',
   info: 'INFO',
   warn: 'WARNING',
   error: 'ERROR',
   fatal: 'CRITICAL',
}

const withoutSeverity = (event: Event): Event =>
   Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'severity')) as Event

// Never throws: a failed write is counted, and one EVENTS_DROPPED warning per minute reports the count.
export const createLogger = ({ service, stream, now = () => new Date() }: LoggerOptions): Logger => {
   const sink = pino(
      {
         level: 'trace',
         base: null,
         timestamp: false,
         formatters: { level: label => ({ severity: PINO_SEVERITY[label] ?? 'DEFAULT' }) },
      },
      stream
   )
   let dropped = 0
   let lastReportAt = Number.NEGATIVE_INFINITY

   const report = (force: boolean) => {
      const at = now().getTime()

      if (dropped === 0 || (!force && at - lastReportAt < DROP_WINDOW_MS)) {
         return
      }

      const count = dropped
      dropped = 0
      lastReportAt = at

      try {
         sink.warn(
            withoutSeverity(
               buildEvent({
                  service,
                  level: 'warn',
                  message: 'Events were dropped',
                  time: now().toISOString(),
                  fields: {
                     code: 'EVENTS_DROPPED',
                     dropped: count,
                  },
               })
            )
         )
      } catch {
         dropped += count
      }
   }

   const write = (level: Level, message: string, fields: LogFields = {}) => {
      try {
         const correlationId = currentCorrelationId()
         const event: Event = buildEvent({
            service,
            level,
            message,
            time: now().toISOString(),
            fields: {
               ...(correlationId === undefined ? {} : { correlationId }),
               ...fields,
            },
         })

         sink[level](withoutSeverity(fitToLimit(event)))
      } catch {
         dropped += 1
         report(false)
      }
   }

   return {
      debug: (message, fields) => write('debug', message, fields),
      info: (message, fields) => write('info', message, fields),
      warn: (message, fields) => write('warn', message, fields),
      error: (message, fields) => write('error', message, fields),
      fatal: (message, fields) => write('fatal', message, fields),
      flush: () => report(true),
   }
}

const WARN_WINDOW_MS = 60_000
const MAX_SOURCES = 1000

// Keeps an incoming ID that is 8 to 64 letters, digits or hyphens, otherwise makes one; the raw value is never logged.
export const createIdGate = (log: Logger, now: () => number = Date.now) => {
   const sources = new Map<string, { at: number; suppressed: number }>()

   return (incoming: unknown, source: string): string => {
      if (isCorrelationId(incoming)) {
         return incoming
      }

      const at = now()
      const seen = sources.get(source)

      if (seen === undefined || at - seen.at >= WARN_WINDOW_MS) {
         log.warn('Correlation ID replaced', {
            code: 'CORRELATION_ID_REPLACED',
            source,
            suppressed: seen?.suppressed ?? 0,
         })
         sources.delete(source)
         sources.set(source, {
            at,
            suppressed: 0,
         })

         if (sources.size > MAX_SOURCES) {
            const oldest = sources.keys().next().value

            if (oldest !== undefined) {
               sources.delete(oldest)
            }
         }
      } else {
         seen.suppressed += 1
      }

      return randomUUID()
   }
}
