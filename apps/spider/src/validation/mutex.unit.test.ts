import { describe, expect, it } from 'vitest'

import { Mutex } from './mutex'

describe('Mutex', () => {
   it('should run one job at a time, in the order they came', async () => {
      const mutex = new Mutex()
      const events: string[] = []
      let finishFirst: () => void = () => undefined

      const first = mutex.runExclusive(async () => {
         events.push('first start')
         await new Promise<void>(resolve => (finishFirst = resolve))
         events.push('first end')
      })
      const second = mutex.runExclusive(async () => {
         events.push('second start')
      })

      await Promise.resolve()
      await Promise.resolve()

      expect(events).toEqual(['first start'])

      finishFirst()
      await Promise.all([first, second])

      expect(events).toEqual(['first start', 'first end', 'second start'])
   })

   it('should hand back what the job returned', async () => {
      await expect(new Mutex().runExclusive(async () => 42)).resolves.toBe(42)
   })

   it('should pass a failure on to its caller without blocking the next job', async () => {
      const mutex = new Mutex()

      await expect(
         mutex.runExclusive(async () => {
            throw new Error('boom')
         })
      ).rejects.toThrow('boom')
      await expect(mutex.runExclusive(async () => 'next')).resolves.toBe('next')
   })
})
