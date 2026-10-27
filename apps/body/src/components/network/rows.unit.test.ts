import { describe, expect, it } from 'vitest'

import { type NetworkRequest, type RequestState } from './types'

import { countsOf, filterOf, profileUrl, visibleRequests } from './rows'

const request = (id: string, state: RequestState, name = `Person ${id}`, headline = 'Engineer', mutual?: string) =>
   ({
      id,
      slug: `person-${id}`,
      name,
      headline,
      mutual,
      state,
   }) satisfies NetworkRequest

describe('filterOf', () => {
   it('should keep a request that is being answered under Waiting, and group the failures under Needs a look', () => {
      expect(filterOf('WAITING')).toBe('WAITING')
      expect(filterOf('QUEUED')).toBe('WAITING')
      expect(filterOf('ACCEPTED')).toBe('ACCEPTED')
      expect(filterOf('IGNORED')).toBe('IGNORED')
      expect(filterOf('GONE')).toBe('ATTENTION')
      expect(filterOf('UNSURE')).toBe('ATTENTION')
      expect(filterOf('FAILED')).toBe('ATTENTION')
   })
})

describe('countsOf', () => {
   it('should count each chip', () => {
      expect(
         countsOf([request('1', 'WAITING'), request('2', 'QUEUED'), request('3', 'IGNORED'), request('4', 'GONE')])
      ).toEqual({
         WAITING: 2,
         ACCEPTED: 0,
         IGNORED: 1,
         ATTENTION: 1,
      })
   })
})

describe('visibleRequests', () => {
   const NOW = new Date('2026-10-27T12:00:00Z')
   const list = [
      request('1', 'WAITING', 'Ada Lovelace', 'Mathematician at Analytical Engines'),
      request('2', 'WAITING', 'Grace Hopper', 'Rear Admiral', 'Ada Lovelace is a mutual connection'),
      request('3', 'ACCEPTED', 'Alan Turing', 'Computer scientist'),
   ]

   it('should show only the chosen chip, in the order given', () => {
      expect(visibleRequests(list, 'WAITING', '', NOW).map(({ id }) => id)).toEqual(['1', '2'])
      expect(visibleRequests(list, 'ACCEPTED', '', NOW).map(({ id }) => id)).toEqual(['3'])
   })

   it('should keep a request answered a moment ago under Waiting, and move it to its own chip after that', () => {
      const answered = [{ ...request('4', 'ACCEPTED'), answeredAt: new Date(NOW.getTime() - 5000).toISOString() }]
      const later = new Date(NOW.getTime() + 20_000)

      expect(visibleRequests(answered, 'WAITING', '', NOW).map(({ id }) => id)).toEqual(['4'])
      expect(visibleRequests(answered, 'WAITING', '', later)).toEqual([])
      expect(visibleRequests(answered, 'ACCEPTED', '', later).map(({ id }) => id)).toEqual(['4'])
   })

   it('should match every typed word against the name, the headline and the mutual connection, ignoring case', () => {
      expect(visibleRequests(list, 'WAITING', '  ADA ', NOW).map(({ id }) => id)).toEqual(['1', '2'])
      expect(visibleRequests(list, 'WAITING', 'ada admiral', NOW).map(({ id }) => id)).toEqual(['2'])
      expect(visibleRequests(list, 'WAITING', 'nobody', NOW)).toEqual([])
   })
})

describe('profileUrl', () => {
   it('should point at the person and make the slug safe for an address', () => {
      expect(profileUrl('ada-lovelace-123')).toBe('https://www.linkedin.com/in/ada-lovelace-123/')
      expect(profileUrl('a/b?c')).toBe('https://www.linkedin.com/in/a%2Fb%3Fc/')
   })
})
