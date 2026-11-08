import { describe, expect, it } from 'vitest'

import { createIdGate, createLogger, currentCorrelationId, isCorrelationId, withCorrelation } from './server'

const memory = () => {
   const lines: string[] = []

   return {
      lines,
      stream: { write: (line: string) => void lines.push(line) },
   }
}

const parse = (lines: string[]) => lines.map(line => JSON.parse(line) as Record<string, unknown>)

describe('createLogger', () => {
   it('should write one JSON line with the envelope fields and Cloud Logging severity', () => {
      const { lines, stream } = memory()
      const logger = createLogger({
         service: 'spider',
         stream,
         now: () => new Date('2026-11-08T10:00:00.000Z'),
      })

      logger.error('Proxy lookup failed', {
         code: 'PROXY_FAILED',
         cause: 'PROXY_LOOKUP_FAILED',
      })

      expect(parse(lines)).toEqual([
         {
            severity: 'ERROR',
            message: 'Proxy lookup failed',
            time: '2026-11-08T10:00:00.000Z',
            service: 'spider',
            code: 'PROXY_FAILED',
            cause: 'PROXY_LOOKUP_FAILED',
         },
      ])
   })

   it('should attach the correlation ID of the current context', () => {
      const { lines, stream } = memory()
      const logger = createLogger({
         service: 'brain',
         stream,
      })

      withCorrelation('11111111-aaaa-4bbb-8ccc-222222222222', () => logger.info('inside'))

      expect(parse(lines)[0]).toMatchObject({ correlationId: '11111111-aaaa-4bbb-8ccc-222222222222' })
      expect(currentCorrelationId()).toBeUndefined()
   })

   it('should keep the correlation ID across an async hop', async () => {
      const seen = await withCorrelation('abcdefgh-1234', async () => {
         await new Promise(resolve => setTimeout(resolve, 1))

         return currentCorrelationId()
      })

      expect(seen).toBe('abcdefgh-1234')
   })

   it('should never throw when the stream fails, and keep counting the drops', () => {
      const broken = {
         write: () => {
            throw new Error('stdout is gone')
         },
      }
      const logger = createLogger({
         service: 'spider',
         stream: broken,
         now: () => new Date(0),
      })

      expect(() => logger.info('lost')).not.toThrow()
      expect(() => logger.flush()).not.toThrow()
   })

   it('should write a JSON line for a fatal event as CRITICAL', () => {
      const { lines, stream } = memory()

      createLogger({
         service: 'body',
         stream,
      }).fatal('down')

      expect(parse(lines)[0]).toMatchObject({ severity: 'CRITICAL' })
   })
})

describe('isCorrelationId', () => {
   it('should accept 8 to 64 letters, digits and hyphens only', () => {
      expect(isCorrelationId('abcdef12')).toBe(true)
      expect(isCorrelationId('a'.repeat(64))).toBe(true)
      expect(isCorrelationId('short')).toBe(false)
      expect(isCorrelationId('bad id with spaces')).toBe(false)
      expect(isCorrelationId('a'.repeat(65))).toBe(false)
      expect(isCorrelationId(42)).toBe(false)
   })
})

describe('createIdGate', () => {
   it('should keep a valid incoming ID', () => {
      const { lines, stream } = memory()
      const gate = createIdGate(
         createLogger({
            service: 'brain',
            stream,
         }),
         () => 0
      )

      expect(gate('abcdef12-3456', '10.0.0.1')).toBe('abcdef12-3456')
      expect(lines).toHaveLength(0)
   })

   it('should replace an invalid ID, warn once per source per minute, and never log the raw value', () => {
      const { lines, stream } = memory()
      let at = 0
      const gate = createIdGate(
         createLogger({
            service: 'brain',
            stream,
         }),
         () => at
      )

      const first = gate('bad value!', '10.0.0.1')
      const second = gate('bad value!', '10.0.0.1')

      expect(isCorrelationId(first)).toBe(true)
      expect(isCorrelationId(second)).toBe(true)
      expect(first).not.toBe(second)
      expect(parse(lines)).toHaveLength(1)
      expect(lines.join('')).not.toContain('bad value!')

      at = 60_000
      gate('bad value!', '10.0.0.1')

      expect(parse(lines)).toHaveLength(2)
      expect(parse(lines)[1]).toMatchObject({
         code: 'CORRELATION_ID_REPLACED',
         suppressed: 1,
      })
   })
})
