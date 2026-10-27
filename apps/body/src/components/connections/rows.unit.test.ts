import { describe, expect, it } from 'vitest'

import { countsOf, visibleConnections } from './rows'

const row = (
   name: string,
   state: 'CONNECTED' | 'REMOVING' | 'REMOVED' | 'GONE' | 'UNSURE' | 'FAILED',
   headline = ''
) => ({
   name,
   headline,
   state,
})

const rows = [
   row('Ada Lovelace', 'CONNECTED', 'Mathematician at Analytical Engines'),
   row('Grace Hopper', 'REMOVING', 'Rear admiral'),
   row('Alan Turing', 'UNSURE', 'Computer scientist'),
   row('Edsger Dijkstra', 'REMOVED'),
   row('Linus Torvalds', 'GONE', 'Kernel maintainer'),
]

describe('countsOf', () => {
   it('should count the list apart from the people who were removed or are gone', () => {
      expect(countsOf(rows)).toEqual({
         LIST: 3,
         OVER: 2,
      })
      expect(countsOf([])).toEqual({
         LIST: 0,
         OVER: 0,
      })
   })
})

describe('visibleConnections', () => {
   it('should keep the list and the people who are over in their own views, in the order given', () => {
      expect(visibleConnections(rows, 'LIST', '').map(({ name }) => name)).toEqual([
         'Ada Lovelace',
         'Grace Hopper',
         'Alan Turing',
      ])
      expect(visibleConnections(rows, 'OVER', '').map(({ name }) => name)).toEqual([
         'Edsger Dijkstra',
         'Linus Torvalds',
      ])
   })

   it('should match every word typed in the name or the headline, whatever the case', () => {
      expect(visibleConnections(rows, 'LIST', 'ada MATH').map(({ name }) => name)).toEqual(['Ada Lovelace'])
      expect(visibleConnections(rows, 'LIST', 'admiral').map(({ name }) => name)).toEqual(['Grace Hopper'])
      expect(visibleConnections(rows, 'LIST', 'ada admiral')).toEqual([])
      expect(visibleConnections(rows, 'OVER', '  kernel ').map(({ name }) => name)).toEqual(['Linus Torvalds'])
   })
})
