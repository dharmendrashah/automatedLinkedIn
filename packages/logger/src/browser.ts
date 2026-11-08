import { type Event, type Level, buildEvent, fitToLimit } from './event'

export type BrowserFields = Record<string, unknown>

// The body writes console objects with the same fields as the servers, not JSON lines.
export const browserEvent = (service: string, level: Level, message: string, fields: BrowserFields = {}): Event =>
   fitToLimit(
      buildEvent({
         service,
         level,
         message,
         time: new Date().toISOString(),
         fields,
      })
   )

const consoleFor = (level: Level) => {
   switch (level) {
      case 'debug':
         return console.debug
      case 'info':
         return console.info
      case 'warn':
         return console.warn
      case 'error':
      case 'fatal':
         return console.error
   }
}

export const logToConsole = (service: string, level: Level, message: string, fields: BrowserFields = {}): void => {
   consoleFor(level)(browserEvent(service, level, message, fields))
}
