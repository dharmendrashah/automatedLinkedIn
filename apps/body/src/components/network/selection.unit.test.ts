import { describe, expect, it } from 'vitest'

import { type NetworkRequest, type RequestState } from './types'

import { canChoose, firstWaiting, fullReason, stillChosen, toggleChoice } from './selection'

const request = (id: string, state: RequestState = 'WAITING') =>
   ({
      id,
      slug: id,
      name: id,
      headline: '',
      state,
   }) satisfies NetworkRequest

describe('toggleChoice', () => {
   it('should add a request, take it back, and add nothing past the cap', () => {
      expect(toggleChoice([], 'a', 2)).toEqual(['a'])
      expect(toggleChoice(['a'], 'a', 2)).toEqual([])
      expect(toggleChoice(['a', 'b'], 'c', 2)).toEqual(['a', 'b'])
      expect(toggleChoice(['a', 'b'], 'b', 2)).toEqual(['a'])
   })
})

describe('stillChosen', () => {
   it('should drop a request that left, is being answered, or no longer fits under a lower cap', () => {
      const list = [request('a'), request('b', 'QUEUED'), request('c'), request('d')]

      expect(canChoose(request('a', 'IGNORED'))).toBe(false)
      expect(stillChosen(['a', 'b', 'gone', 'c', 'd'], list, 5)).toEqual(['a', 'c', 'd'])
      expect(stillChosen(['a', 'c', 'd'], list, 2)).toEqual(['a', 'c'])
   })
})

describe('firstWaiting', () => {
   it('should take the first requests that wait, up to the cap', () => {
      expect(firstWaiting([request('a', 'ACCEPTED'), request('b'), request('c'), request('d')], 2)).toEqual(['b', 'c'])
   })
})

describe('fullReason', () => {
   it('should say nothing while there is room, and why there is none once the cap is reached', () => {
      expect(fullReason(3, 10, 50)).toBeUndefined()
      expect(fullReason(10, 10, 50)).toBe('At most 10 at a time.')
      expect(fullReason(5, 5, 5)).toBe('This account can answer 5 more today.')
      expect(fullReason(0, 0, 0)).toBe('This account has used its answers for today. It can answer again tomorrow.')
   })
})
