import { describe, expect, it } from 'vitest'

import { type NetworkRequest, type RequestState } from './types'

import {
   answersByAccount,
   canChoose,
   chosenCounts,
   firstWaiting,
   fullReason,
   stillChosen,
   toggleChoice,
} from './selection'

const request = (id: string, state: RequestState = 'WAITING', accountId = 'one') =>
   ({
      id,
      accountId,
      slug: id,
      name: id,
      headline: '',
      state,
   }) satisfies NetworkRequest

const cap = (limits: Record<string, number>) => (accountId: string) => limits[accountId] ?? 0

describe('toggleChoice', () => {
   it('should add a request, take it back, and add nothing past the cap of its account', () => {
      const list = [request('a'), request('b'), request('c')]
      const two = cap({ one: 2 })

      expect(toggleChoice([], list[0] as NetworkRequest, list, two)).toEqual(['a'])
      expect(toggleChoice(['a'], list[0] as NetworkRequest, list, two)).toEqual([])
      expect(toggleChoice(['a', 'b'], list[2] as NetworkRequest, list, two)).toEqual(['a', 'b'])
      expect(toggleChoice(['a', 'b'], list[1] as NetworkRequest, list, two)).toEqual(['a'])
   })

   it('should count the cap for each account, so a full account does not stop another', () => {
      const list = [request('a'), request('b'), request('x', 'WAITING', 'two')]
      const limits = cap({ one: 1, two: 1 })

      expect(toggleChoice(['a'], list[1] as NetworkRequest, list, limits)).toEqual(['a'])
      expect(toggleChoice(['a'], list[2] as NetworkRequest, list, limits)).toEqual(['a', 'x'])
      expect(chosenCounts(['a', 'x'], list)).toEqual(
         new Map([
            ['one', 1],
            ['two', 1],
         ])
      )
   })
})

describe('stillChosen', () => {
   it('should drop a request that left, is being answered, or no longer fits under a lower cap of its account', () => {
      const list = [request('a'), request('b', 'QUEUED'), request('c'), request('d'), request('x', 'WAITING', 'two')]

      expect(canChoose(request('a', 'IGNORED'))).toBe(false)
      expect(stillChosen(['a', 'b', 'gone', 'c', 'd', 'x'], list, cap({ one: 5, two: 5 }))).toEqual([
         'a',
         'c',
         'd',
         'x',
      ])
      expect(stillChosen(['a', 'c', 'd', 'x'], list, cap({ one: 2, two: 1 }))).toEqual(['a', 'c', 'x'])
      expect(stillChosen(['a', 'x'], list, cap({ one: 1, two: 0 }))).toEqual(['a'])
   })
})

describe('firstWaiting', () => {
   it('should take the first requests that wait, up to the cap of each account', () => {
      const list = [
         request('a', 'ACCEPTED'),
         request('b'),
         request('c'),
         request('d'),
         request('x', 'WAITING', 'two'),
         request('y', 'WAITING', 'two'),
      ]

      expect(firstWaiting(list, cap({ one: 2, two: 1 }))).toEqual(['b', 'c', 'x'])
      expect(firstWaiting(list, cap({ one: 0, two: 5 }))).toEqual(['x', 'y'])
   })
})

describe('answersByAccount', () => {
   it('should group the chosen requests by account, keeping the order of the asks inside each', () => {
      expect(
         answersByAccount([
            { accountId: 'one', id: 'a', action: 'ACCEPT' },
            { accountId: 'two', id: 'x', action: 'IGNORE' },
            { accountId: 'one', id: 'b', action: 'IGNORE' },
         ])
      ).toEqual([
         {
            accountId: 'one',
            asks: [
               { id: 'a', action: 'ACCEPT' },
               { id: 'b', action: 'IGNORE' },
            ],
         },
         {
            accountId: 'two',
            asks: [{ id: 'x', action: 'IGNORE' }],
         },
      ])
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
