import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSampleSource, scenarioOf } from './sample-source'
import { NetworkRefusal } from './source'

beforeEach(() => {
   vi.useFakeTimers()
   vi.setSystemTime(new Date('2026-10-27T12:00:00Z'))
})

afterEach(() => {
   vi.useRealTimers()
})

const ACCOUNT = 'account-1'
const OTHER = 'account-2'

describe('scenarioOf', () => {
   it('should take a known view and fall back to the busy one', () => {
      expect(scenarioOf('flaky')).toBe('flaky')
      expect(scenarioOf('nope')).toBe('busy')
      expect(scenarioOf(null)).toBe('busy')
   })
})

describe('the busy view', () => {
   it('should list eight waiting people with their account, read 12 minutes ago, and none answered today', async () => {
      const source = createSampleSource('busy')
      const snapshot = await source.load([ACCOUNT])

      expect(source.key).toBe('sample-busy')
      expect(snapshot.requests).toHaveLength(8)
      expect(snapshot.requests.every(({ state, accountId }) => state === 'WAITING' && accountId === ACCOUNT)).toBe(true)
      expect(snapshot.accounts).toEqual([
         {
            accountId: ACCOUNT,
            total: 8,
            readAt: '2026-10-27T11:48:00.000Z',
            nextCheckAt: '2026-10-28T08:00:00.000Z',
            reading: false,
            answeredToday: 0,
         },
      ])
      await expect(source.waiting([ACCOUNT, 'other'])).resolves.toEqual({ [ACCOUNT]: 8, other: 8 })
   })

   it('should list several accounts in one list, in the order asked, with different people and ids for each', async () => {
      const source = createSampleSource('busy')
      const { requests, accounts } = await source.load([OTHER, ACCOUNT])

      expect(accounts.map(({ accountId }) => accountId)).toEqual([OTHER, ACCOUNT])
      expect(requests).toHaveLength(16)
      expect(requests.slice(0, 8).every(({ accountId }) => accountId === OTHER)).toBe(true)
      expect(new Set(requests.map(({ id }) => id)).size).toBe(16)
      expect(requests[0]?.name).not.toBe(requests[8]?.name)
   })

   it('should queue the answers, then settle them one after the other, and count what was taken', async () => {
      const source = createSampleSource('busy')
      const [first, second, third] = (await source.load([ACCOUNT])).requests

      await source.answer(
         ACCOUNT,
         [
            {
               id: first?.id ?? '',
               action: 'ACCEPT',
            },
            {
               id: second?.id ?? '',
               action: 'IGNORE',
            },
         ],
         { startAnyway: false }
      )

      let now = await source.load([ACCOUNT])

      expect(now.requests.slice(0, 2).map(({ state, action }) => [state, action])).toEqual([
         ['QUEUED', 'ACCEPT'],
         ['QUEUED', 'IGNORE'],
      ])
      expect(now.requests[2]?.id).toBe(third?.id)
      expect(now.requests[2]?.state).toBe('WAITING')

      await vi.advanceTimersByTimeAsync(1300)
      now = await source.load([ACCOUNT])
      expect(now.requests.slice(0, 2).map(({ state }) => state)).toEqual(['ACCEPTED', 'QUEUED'])

      await vi.advanceTimersByTimeAsync(1300)
      now = await source.load([ACCOUNT])
      expect(now.requests.slice(0, 2).map(({ state }) => state)).toEqual(['ACCEPTED', 'IGNORED'])
      expect(now.accounts[0]?.answeredToday).toBe(2)
      expect(now.requests[0]?.answeredAt).toBeDefined()
   })

   it('should read each account for a moment and then show when it finished', async () => {
      const source = createSampleSource('busy')

      await expect(source.refresh([ACCOUNT, OTHER], { startAnyway: false })).resolves.toEqual({
         started: [ACCOUNT, OTHER],
         skipped: [],
      })
      expect((await source.load([ACCOUNT, OTHER])).accounts.map(({ reading }) => reading)).toEqual([true, true])

      await vi.advanceTimersByTimeAsync(1600)

      const done = await source.load([ACCOUNT, OTHER])

      expect(done.accounts.map(({ reading }) => reading)).toEqual([false, false])
      expect(done.accounts[0]?.readAt).toBe('2026-10-27T12:00:01.500Z')
   })

   it('should refuse more than 10 at a time, and nothing past the 50 of a day', async () => {
      const source = createSampleSource('many')
      const asks = (await source.load([ACCOUNT])).requests.map(({ id }) => ({ id, action: 'ACCEPT' as const }))

      await expect(source.answer(ACCOUNT, asks.slice(0, 11), { startAnyway: false })).rejects.toThrow(
         'At most 10 at a time.'
      )

      for (let run = 0; run < 4; run += 1) {
         await source.answer(ACCOUNT, asks.slice(run * 10, run * 10 + 10), { startAnyway: false })
         await vi.advanceTimersByTimeAsync(13_000)
      }

      expect((await source.load([ACCOUNT])).accounts[0]?.answeredToday).toBe(40)
      await expect(source.answer(ACCOUNT, asks.slice(0, 11), { startAnyway: false })).rejects.toBeInstanceOf(
         NetworkRefusal
      )
   })
})

describe('the other views', () => {
   it('should show every state in the mixed view', async () => {
      const { requests } = await createSampleSource('mixed').load([ACCOUNT])

      expect(new Set(requests.map(({ state }) => state))).toEqual(
         new Set(['WAITING', 'QUEUED', 'ACCEPTED', 'IGNORED', 'GONE', 'UNSURE', 'FAILED'])
      )
   })

   it('should have nobody in the empty view, and skip an account that is signed out with its sentence', async () => {
      expect((await createSampleSource('empty').load([ACCOUNT])).requests).toEqual([])

      const signedOut = createSampleSource('signedout')

      expect((await signedOut.load([ACCOUNT])).accounts[0]?.problem).toBe('SIGNED_OUT')
      await expect(signedOut.refresh([ACCOUNT], { startAnyway: false })).resolves.toMatchObject({
         started: [],
         skipped: [{ accountId: ACCOUNT, budget: false }],
      })
   })

   it('should skip every account once because of the budget, and read them after Start anyway', async () => {
      const source = createSampleSource('budget')

      await expect(source.refresh([ACCOUNT, OTHER], { startAnyway: false })).resolves.toMatchObject({
         started: [],
         skipped: [
            { accountId: ACCOUNT, budget: true },
            { accountId: OTHER, budget: true },
         ],
      })
      await expect(source.refresh([ACCOUNT, OTHER], { startAnyway: true })).resolves.toMatchObject({
         started: [ACCOUNT, OTHER],
         skipped: [],
      })
      await expect(source.refresh([ACCOUNT], { startAnyway: false })).resolves.toMatchObject({ started: [ACCOUNT] })
   })

   it('should let a flaky run go wrong in the ways a real one can', async () => {
      const source = createSampleSource('flaky')
      const asks = (await source.load([ACCOUNT])).requests
         .slice(0, 4)
         .map(({ id }) => ({ id, action: 'ACCEPT' as const }))

      await source.answer(ACCOUNT, asks, { startAnyway: false })
      await vi.advanceTimersByTimeAsync(6000)

      const { requests, accounts } = await source.load([ACCOUNT])

      expect(requests.slice(0, 4).map(({ state }) => state)).toEqual(['ACCEPTED', 'GONE', 'UNSURE', 'FAILED'])
      expect(requests[3]?.failure).toBe('LinkedIn did not take the click. Try it again.')
      expect(accounts[0]?.answeredToday).toBe(1)
   })
})
