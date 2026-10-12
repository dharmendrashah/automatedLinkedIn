import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type CheckResult, type StatusModule } from './types'

import { StatusBoard } from './statusBoard'

const module = (key: string, check: () => Promise<CheckResult>, extra: Partial<StatusModule> = {}): StatusModule => ({
   key,
   group: 'The app',
   name: key.toUpperCase(),
   description: `${key} description`,
   check,
   ...extra,
})

const liveCheck = () => vi.fn(async () => ({ state: 'live' as const }))

beforeEach(() => {
   vi.useFakeTimers()
   vi.setSystemTime(new Date('2026-10-12T12:00:00.000Z'))
})

afterEach(() => {
   vi.useRealTimers()
})

describe('StatusBoard', () => {
   it('should list every module with its status, and nothing that is not meant to leave brain', async () => {
      const board = new StatusBoard([
         module('database', liveCheck(), { ttlMs: 60_000 }),
         module('email', async () => ({
            state: 'dead',
            reason: 'Not answering',
         })),
      ])

      const snapshot = await board.snapshot()

      expect(snapshot).toEqual({
         checkedAt: '2026-10-12T12:00:00.000Z',
         overall: 'dead',
         modules: [
            {
               key: 'database',
               group: 'The app',
               name: 'DATABASE',
               description: 'database description',
               status: 'live',
            },
            {
               key: 'email',
               group: 'The app',
               name: 'EMAIL',
               description: 'email description',
               status: 'dead',
               reason: 'Not answering',
            },
         ],
      })
   })

   it.each([
      [['live', 'live'], 'live'],
      [['live', 'unknown'], 'unknown'],
      [['live', 'dead', 'unknown'], 'dead'],
      [[], 'live'],
   ] as const)('should be %j overall when the modules are %j', async (states, overall) => {
      const board = new StatusBoard(
         states.map((state, index) =>
            module(`m${index}`, async () => ({
               state,
               ...(state !== 'live' && { reason: 'x' }),
            }))
         )
      )

      expect((await board.snapshot()).overall).toBe(overall)
   })

   it('should run the checks at the same time, not one after the other', async () => {
      const started: string[] = []
      const slow = (key: string) =>
         module(key, async () => {
            started.push(key)
            await new Promise(resolve => setTimeout(resolve, 2000))

            return { state: 'live' }
         })
      const board = new StatusBoard([slow('a'), slow('b'), slow('c')])
      const pending = board.snapshot()

      await vi.advanceTimersByTimeAsync(0)
      expect(started).toEqual(['a', 'b', 'c'])

      await vi.advanceTimersByTimeAsync(2000)
      await expect(pending).resolves.toMatchObject({ overall: 'live' })
   })

   it('should call a module dead and timed out when its check hangs, without holding the others up', async () => {
      const board = new StatusBoard([module('stuck', () => new Promise(() => undefined)), module('fine', liveCheck())])
      const pending = board.snapshot()

      await vi.advanceTimersByTimeAsync(3600)

      const { modules } = await pending

      expect(modules.map(item => [item.key, item.status, item.reason])).toEqual([
         ['stuck', 'dead', 'Timed out'],
         ['fine', 'live', undefined],
      ])
   })

   it('should call a module dead when its check throws, and not repeat the text of the error', async () => {
      const board = new StatusBoard([
         module('broken', async () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'))),
      ])

      const { modules } = await board.snapshot()

      expect(modules[0]).toMatchObject({
         status: 'dead',
         reason: 'Not answering',
      })
      expect(JSON.stringify(modules)).not.toMatch(/hunter2|10\.0\.0\.5/)
   })

   it('should reuse an answer for ten seconds, then check again', async () => {
      const check = liveCheck()
      const board = new StatusBoard([module('a', check)])

      await board.snapshot()
      await vi.advanceTimersByTimeAsync(9000)
      await board.snapshot()

      expect(check).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(2000)
      await board.snapshot()

      expect(check).toHaveBeenCalledTimes(2)
   })

   it('should keep a module with its own time limit for as long as that says', async () => {
      const slowCheck = liveCheck()
      const board = new StatusBoard([module('lookup', slowCheck, { ttlMs: 60_000 })])

      await board.snapshot()
      await vi.advanceTimersByTimeAsync(30_000)
      await board.snapshot()

      expect(slowCheck).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(31_000)
      await board.snapshot()

      expect(slowCheck).toHaveBeenCalledTimes(2)
   })

   it('should run a check once for many callers that arrive while it is running', async () => {
      let release: () => void = () => undefined
      const check = vi.fn(
         () =>
            new Promise<CheckResult>(resolve => {
               release = () => resolve({ state: 'live' })
            })
      )
      const board = new StatusBoard([module('a', check)])

      const callers = [board.snapshot(), board.snapshot(), board.snapshot()]

      await vi.advanceTimersByTimeAsync(0)
      release()
      await Promise.all(callers)

      expect(check).toHaveBeenCalledTimes(1)
   })

   it('should say when the answer was assembled, using the latest check', async () => {
      const board = new StatusBoard([module('a', liveCheck(), { ttlMs: 60_000 }), module('b', liveCheck())])

      await board.snapshot()
      await vi.advanceTimersByTimeAsync(11_000)

      expect((await board.snapshot()).checkedAt).toBe('2026-10-12T12:00:11.000Z')
   })
})
