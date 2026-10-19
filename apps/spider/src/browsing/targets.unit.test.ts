import { describe, expect, it, vi } from 'vitest'

import { StepFailed } from './errors'
import { runTargets } from './targets'

class Lost extends Error {}

const setup = (over: Partial<Parameters<typeof runTargets<number>>[0]> = {}) => {
   const log: string[] = []
   let time = 0
   const run = {
      targets: [1, 2, 3, 4, 5, 6],
      step: vi.fn(async (_target: number) => true),
      recover: vi.fn(async () => undefined),
      between: vi.fn(async () => {
         time += 1000
      }),
      elapsed: () => time,
      budgetMs: 10_000,
      maxFailuresInARow: 3,
      isFatal: (error: unknown) => error instanceof Lost,
      warn: (message: string) => log.push(message),
      says: {
         stepStopped: 'stopped',
         notRecovered: 'not recovered',
      },
      ...over,
   }

   return {
      run,
      log,
   }
}

describe('runTargets', () => {
   it('should do every target and count the ones that came to something', async () => {
      const { run } = setup({ step: vi.fn(async (target: number) => target !== 2) })

      await expect(runTargets(run)).resolves.toBe(5)
   })

   it('should begin no new target once the budget is used up', async () => {
      const { run } = setup({ budgetMs: 2500 })

      await expect(runTargets(run)).resolves.toBe(3)
   })

   it('should stop after too many targets in a row that came to nothing', async () => {
      const { run } = setup({ step: vi.fn(async () => false) })

      await runTargets(run)

      expect(run.step).toHaveBeenCalledTimes(3)
   })

   it('should say what failed, recover, and go on with the next target', async () => {
      const { run, log } = setup({
         step: vi.fn(async (target: number) => {
            if (target === 1) {
               throw new StepFailed('the link would not open')
            }

            if (target === 2) {
               throw new Error('secret page text')
            }

            return true
         }),
      })

      await expect(runTargets(run)).resolves.toBe(4)

      expect(log).toEqual(['the link would not open', 'stopped'])
      expect(run.recover).toHaveBeenCalledTimes(2)
   })

   it('should say when it could not recover, and still go on', async () => {
      const { run, log } = setup({
         targets: [1, 2],
         step: vi.fn(async (target: number) => {
            if (target === 1) {
               throw new StepFailed('the step failed')
            }

            return true
         }),
         recover: vi.fn(async () => {
            throw new StepFailed('x')
         }),
      })

      await expect(runTargets(run)).resolves.toBe(1)

      expect(log).toEqual(['the step failed', 'not recovered'])
   })

   it('should not absorb an error that ends the run, from a step or from recovering', async () => {
      const fromStep = setup({
         step: vi.fn(async () => {
            throw new Lost()
         }),
      })
      const fromRecover = setup({
         step: vi.fn(async () => {
            throw new StepFailed('x')
         }),
         recover: vi.fn(async () => {
            throw new Lost()
         }),
      })

      await expect(runTargets(fromStep.run)).rejects.toBeInstanceOf(Lost)
      await expect(runTargets(fromRecover.run)).rejects.toBeInstanceOf(Lost)
   })
})
