const HIDDEN = '***'
const MAX_TEXT_CHARS = 2000
const MAX_MESSAGE_CHARS = 500
const MAX_STACK_FRAMES = 20
export const MAX_EVENT_BYTES = 2048
const MAX_DEPTH = 10

const SENSITIVE_NAME = '[A-Za-z0-9_.-]*(?:token|secret|password|passwd|code|pin|csrf|session|key)[A-Za-z0-9_.-]*'
const SENSITIVE_KEY = /token|secret|password|passwd|csrf|session|cookie|auth|proxy|credential|totp|api_?key/i

const ENVELOPE_KEYS = new Set([
   'severity',
   'message',
   'time',
   'service',
   'correlationId',
   'code',
   'cause',
   'taskId',
   'attempt',
   'error',
])

export const RUNNER_CODES = [
   'UNKNOWN_TASK',
   'INVALID_INPUT',
   'NEEDS_PROXY',
   'NEEDS_ACCOUNT',
   'NOT_ALLOWED',
   'NOT_QUEUED',
   'CANCELLED',
   'PROXY_FAILED',
   'TIMED_OUT',
   'CRASHED',
   'NOT_STARTED',
] as const

export const LOG_CODES = [
   ...RUNNER_CODES,
   'PROXY_LOOKUP_FAILED',
   'WORKER_CRASHED',
   'PUBLISH_FAILED',
   'BODY_ERROR',
   'CORRELATION_ID_REPLACED',
   'EVENTS_DROPPED',
] as const

export type LogCode = (typeof LOG_CODES)[number]

export type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const SEVERITY: Record<Level, string> = {
   debug: 'DEBUG',
   info: 'INFO',
   warn: 'WARNING',
   error: 'ERROR',
   fatal: 'CRITICAL',
}

export const severityOf = (level: Level): string => SEVERITY[level]

export const byteLength = (text: string): number => new TextEncoder().encode(text).length

const maskParameters = (text: string, boundary: string) =>
   text.replace(new RegExp(`(${boundary})(${SENSITIVE_NAME})=([^&#\\s"';]*)`, 'gi'), `$1$2=${HIDDEN}`)

export { maskParameters }

// For free text: addresses with credentials, bearer tokens and sensitive parameters. Cut at 2,000 characters.
export const maskText = (text: string): string => {
   const masked = maskParameters(
      text.replace(/\/\/[^/\s@]+@/g, `//${HIDDEN}@`).replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, `Bearer ${HIDDEN}`),
      '\\b'
   )

   return masked.length > MAX_TEXT_CHARS ? `${masked.slice(0, MAX_TEXT_CHARS)}…` : masked
}

// Masks first, then cuts, so a cut never splits a secret that masking would have hidden.
export const messageText = (text: string): string => {
   const masked = maskText(text)

   return masked.length > MAX_MESSAGE_CHARS ? `${masked.slice(0, MAX_MESSAGE_CHARS - 1)}…` : masked
}

const maskValue = (value: unknown, depth: number): unknown => {
   if (typeof value === 'string') {
      return maskText(value)
   }

   if (depth >= MAX_DEPTH) {
      return HIDDEN
   }

   if (Array.isArray(value)) {
      return value.map(item => maskValue(item, depth + 1))
   }

   if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
         Object.entries(value).map(([key, child]) => [
            key,
            SENSITIVE_KEY.test(key) ? HIDDEN : maskValue(child, depth + 1),
         ])
      )
   }

   return value
}

export type ErrorFields = { name?: string; message?: string; stack?: string }

const textField = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

export const errorFields = (error: unknown): ErrorFields => {
   if (error instanceof Error) {
      return {
         name: error.name,
         message: messageText(error.message),
         stack: framesOf(error.stack ?? ''),
      }
   }

   if (typeof error === 'object' && error !== null) {
      return {
         name: textField(Reflect.get(error, 'name')),
         message: messageText(String(Reflect.get(error, 'message') ?? '')),
         stack: framesOf(textField(Reflect.get(error, 'stack')) ?? ''),
      }
   }

   return { message: messageText(String(error)) }
}

const framesOf = (stack: string): string =>
   maskText(stack)
      .split('\n')
      .slice(0, MAX_STACK_FRAMES + 1)
      .join('\n')

export type EventInput = {
   service: string
   level: Level
   message: string
   time: string
   fields?: Record<string, unknown>
}

export type Event = {
   severity: string
   message: string
   time: string
   service: string
   [key: string]: unknown
}

// Top-level envelope fields are never masked by key; nested object fields are.
export const buildEvent = ({ service, level, message, time, fields = {} }: EventInput): Event => {
   const { error, ...rest } = fields
   const masked = Object.fromEntries(
      Object.entries(rest).map(([key, value]) => [
         key,
         ENVELOPE_KEYS.has(key) ? value : SENSITIVE_KEY.test(key) ? HIDDEN : maskValue(value, 0),
      ])
   )

   return {
      ...masked,
      severity: severityOf(level),
      message: messageText(message),
      time,
      service,
      ...(error === undefined ? {} : { error: errorFields(error) }),
   }
}

// Measures the whole serialised event, because JSON escapes newlines and quotes in the stack.
const cutStack = (envelope: Event, error: ErrorFields, stack: string, maxBytes: number): Event => {
   const withStack = (text: string): Event => ({
      ...envelope,
      error: {
         ...error,
         stack: text,
      },
   })
   let out = stack

   while (out.length > 0 && byteLength(JSON.stringify(withStack(`${out}…`))) > maxBytes) {
      out = out.slice(0, -1)
   }

   return withStack(out.length === 0 ? '' : `${out}…`)
}

// Fields are kept in envelope order; extra fields go first, then the stack is cut to the bytes left.
export const fitToLimit = (event: Event, maxBytes: number = MAX_EVENT_BYTES): Event => {
   if (byteLength(JSON.stringify(event)) <= maxBytes) {
      return event
   }

   const envelope = Object.fromEntries(Object.entries(event).filter(([key]) => ENVELOPE_KEYS.has(key))) as Event
   const error = envelope.error as ErrorFields | undefined

   if (byteLength(JSON.stringify(envelope)) <= maxBytes || error?.stack === undefined) {
      return envelope
   }

   return cutStack(envelope, error, error.stack, maxBytes)
}
