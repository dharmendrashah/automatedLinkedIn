import { describe, expect, it } from 'vitest'

import {
   LOG_CODES,
   MAX_EVENT_BYTES,
   RUNNER_CODES,
   buildEvent,
   byteLength,
   fitToLimit,
   maskText,
   messageText,
   severityOf,
} from './event'

const input = {
   service: 'spider',
   level: 'info' as const,
   message: 'hello',
   time: '2026-11-08T10:00:00.000Z',
}

describe('severity', () => {
   it('should map levels to Cloud Logging severities', () => {
      expect(severityOf('debug')).toBe('DEBUG')
      expect(severityOf('warn')).toBe('WARNING')
      expect(severityOf('fatal')).toBe('CRITICAL')
   })
})

describe('maskText', () => {
   it('should hide credentials in addresses, tokens and sensitive parameters', () => {
      expect(maskText('Proxy socks5://bob:hunter2@10.0.0.1:1080 failed; Bearer abc.def; password=letmein&x=1')).toBe(
         'Proxy socks5://***@10.0.0.1:1080 failed; Bearer ***; password=***&x=1'
      )
   })

   it('should cut a long text at 2,000 characters', () => {
      expect(maskText('a'.repeat(3000))).toHaveLength(2001)
   })
})

describe('buildEvent', () => {
   it('should set the envelope fields and keep the event message', () => {
      expect(
         buildEvent({
            ...input,
            fields: { message: 'other' },
         })
      ).toEqual({
         severity: 'INFO',
         message: 'hello',
         time: input.time,
         service: 'spider',
      })
   })

   it('should mask object fields by key at every nesting level', () => {
      const event = buildEvent({
         ...input,
         fields: {
            totp_secret: 'ABC',
            cookies: [
               {
                  name: 'li_at',
                  value: 'x',
               },
            ],
            proxy: { url: 'u' },
            apiKey: 'k',
            nested: { deep: { password: 'p' } },
         },
      })

      expect(event).toMatchObject({
         totp_secret: '***',
         cookies: '***',
         proxy: '***',
         apiKey: '***',
         nested: { deep: { password: '***' } },
      })
   })

   it('should never mask envelope fields by key, so a failure code survives', () => {
      expect(
         buildEvent({
            ...input,
            fields: {
               code: 'PROXY_FAILED',
               cause: 'PROXY_LOOKUP_FAILED',
            },
         })
      ).toMatchObject({
         code: 'PROXY_FAILED',
         cause: 'PROXY_LOOKUP_FAILED',
      })
   })

   it('should mask then cut a message to 500 characters', () => {
      const { message } = buildEvent({
         ...input,
         message: `token=abc ${'x'.repeat(600)}`,
      })

      expect(message).toMatch(/^token=\*\*\* x+…$/)
      expect(messageText('a'.repeat(600))).toHaveLength(500)
   })

   it('should record an error with its name, message and frames', () => {
      const error = new Error('lookup failed for socks5://bob:hunter2@10.0.0.1')
      const event = buildEvent({
         ...input,
         fields: { error },
      })

      expect(event.error).toMatchObject({
         name: 'Error',
         message: 'lookup failed for socks5://***@10.0.0.1',
      })
      expect(String((event.error as { stack: string }).stack)).not.toContain('hunter2')
   })
})

describe('fitToLimit', () => {
   it('should keep an event that fits as it is', () => {
      const event = buildEvent({
         ...input,
         fields: { code: 'PROXY_FAILED' },
      })

      expect(fitToLimit(event)).toEqual(event)
   })

   it('should drop extra fields first, then cut the stack to the bytes left', () => {
      const frames = Array.from({ length: 40 }, (_, i) => `at fn${i} (/very/long/path/${'x'.repeat(100)})`).join('\n')
      const event = buildEvent({
         ...input,
         fields: {
            code: 'PROXY_FAILED',
            extra: 'x'.repeat(3000),
            error: {
               name: 'Error',
               message: 'm',
               stack: frames,
            },
         },
      })
      const fitted = fitToLimit(event)

      expect(fitted).not.toHaveProperty('extra')
      expect(fitted).toMatchObject({ code: 'PROXY_FAILED' })
      expect(byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(MAX_EVENT_BYTES)
      expect(String((fitted.error as { stack: string }).stack).endsWith('…')).toBe(true)
   })
})

describe('codes', () => {
   it('should contain every runner verdict and the logging-only codes', () => {
      expect(LOG_CODES).toEqual(
         expect.arrayContaining([...RUNNER_CODES, 'PROXY_LOOKUP_FAILED', 'BODY_ERROR', 'EVENTS_DROPPED'])
      )
   })
})
