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

describe('scenarioOf', () => {
   it('should take a known view and fall back to the busy one', () => {
      expect(scenarioOf('flaky')).toBe('flaky')
      expect(scenarioOf('nope')).toBe('busy')
      expect(scenarioOf(null)).toBe('busy')
   })
})

describe('the busy view', () => {
   it('should list eight waiting people with digit ids, read 12 minutes ago, and none answered today', async () => {
      const source = createSampleSource('busy')
      const snapshot = await source.load(ACCOUNT)

      expect(source.key).toBe('sample-busy')
      expect(snapshot.requests).toHaveLength(8)
      expect(snapshot.total).toBe(8)
      expect(snapshot.answeredToday).toBe(0)
      expect(snapshot.requests.every(({ state, id }) => state === 'WAITING' && /^\d{19}$/.test(id))).toBe(true)
      expect(snapshot.readAt).toBe('2026-10-27T11:48:00.000Z')
      await expect(source.waiting([ACCOUNT, 'other'])).resolves.toEqual({ [ACCOUNT]: 8, other: 8 })
   })

   it('should queue the answers, then settle them one after the other, and count what was taken', async () => {
      const source = createSampleSource('busy')
      const [first, second, third] = (await source.load(ACCOUNT)).requests

      await source.answer(
         ACCOUNT,
         [
            { id: first?.id ?? '', action: 'ACCEPT' },
            { id: second?.id ?? '', action: 'IGNORE' },
         ],
         { startAnyway: false }
      )

      let now = await source.load(ACCOUNT)

      expect(now.requests.slice(0, 2).map(({ state, action }) => [state, action])).toEqual([
         ['QUEUED', 'ACCEPT'],
         ['QUEUED', 'IGNORE'],
      ])
      expect(now.requests[2]?.id).toBe(third?.id)
      expect(now.requests[2]?.state).toBe('WAITING')

      await vi.advanceTimersByTimeAsync(1300)
      now = await source.load(ACCOUNT)
      expect(now.requests.slice(0, 2).map(({ state }) => state)).toEqual(['ACCEPTED', 'QUEUED'])

      await vi.advanceTimersByTimeAsync(1300)
      now = await source.load(ACCOUNT)
      expect(now.requests.slice(0, 2).map(({ state }) => state)).toEqual(['ACCEPTED', 'IGNORED'])
      expect(now.answeredToday).toBe(2)
      expect(now.requests[0]?.answeredAt).toBeDefined()
   })

   it('should read for a moment and then show when it finished', async () => {
      const source = createSampleSource('busy')

      await source.refresh(ACCOUNT, { startAnyway: false })
      expect((await source.load(ACCOUNT)).reading).toBe(true)

      await vi.advanceTimersByTimeAsync(1600)

      const done = await source.load(ACCOUNT)

      expect(done.reading).toBe(false)
      expect(done.readAt).toBe('2026-10-27T12:00:01.500Z')
   })

   it('should refuse more than 10 at a time, and nothing past the 50 of a day', async () => {
      const source = createSampleSource('many')
      const asks = (await source.load(ACCOUNT)).requests.map(({ id }) => ({ id, action: 'ACCEPT' as const }))

      await expect(source.answer(ACCOUNT, asks.slice(0, 11), { startAnyway: false })).rejects.toThrow(
         'At most 10 at a time.'
      )

      for (let run = 0; run < 4; run += 1) {
         await source.answer(ACCOUNT, asks.slice(run * 10, run * 10 + 10), { startAnyway: false })
         await vi.advanceTimersByTimeAsync(13_000)
      }

      expect((await source.load(ACCOUNT)).answeredToday).toBe(40)
      await expect(source.answer(ACCOUNT, asks.slice(0, 11), { startAnyway: false })).rejects.toBeInstanceOf(
         NetworkRefusal
      )
   })
})

describe('the other views', () => {
   it('should show every state in the mixed view', async () => {
      const { requests } = await createSampleSource('mixed').load(ACCOUNT)

      expect(new Set(requests.map(({ state }) => state))).toEqual(
         new Set(['WAITING', 'QUEUED', 'ACCEPTED', 'IGNORED', 'GONE', 'UNSURE', 'FAILED'])
      )
   })

   it('should have nobody in the empty view, and refuse to read an account that is signed out', async () => {
      expect((await createSampleSource('empty').load(ACCOUNT)).requests).toEqual([])

      const signedOut = createSampleSource('signedout')

      expect((await signedOut.load(ACCOUNT)).problem).toBe('SIGNED_OUT')
      await expect(signedOut.refresh(ACCOUNT, { startAnyway: false })).rejects.toMatchObject({ budget: false })
   })

   it('should refuse once because of the budget, and go on after Start anyway', async () => {
      const source = createSampleSource('budget')

      await expect(source.refresh(ACCOUNT, { startAnyway: false })).rejects.toMatchObject({ budget: true })
      await expect(source.refresh(ACCOUNT, { startAnyway: true })).resolves.toBeUndefined()
      await expect(source.refresh(ACCOUNT, { startAnyway: false })).resolves.toBeUndefined()
   })

   it('should let a flaky run go wrong in the ways a real one can', async () => {
      const source = createSampleSource('flaky')
      const asks = (await source.load(ACCOUNT)).requests
         .slice(0, 4)
         .map(({ id }) => ({ id, action: 'ACCEPT' as const }))

      await source.answer(ACCOUNT, asks, { startAnyway: false })
      await vi.advanceTimersByTimeAsync(6000)

      const { requests, answeredToday } = await source.load(ACCOUNT)

      expect(requests.slice(0, 4).map(({ state }) => state)).toEqual(['ACCEPTED', 'GONE', 'UNSURE', 'FAILED'])
      expect(requests[3]?.failure).toBe('LinkedIn did not take the click. Try it again.')
      expect(answeredToday).toBe(1)
   })
})
