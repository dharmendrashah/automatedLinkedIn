import { describe, expect, it } from 'vitest'

import { type UniboxMessage } from './types'

import { buildThread, lastOwnIndex } from './thread-model'

const now = new Date(2026, 9, 23, 15, 0).getTime()
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()
const message = (
   id: string,
   direction: 'ME' | 'THEM',
   time: number,
   sender = direction === 'ME' ? 'Me' : 'Ada'
): UniboxMessage => ({
   id,
   direction,
   sender,
   at: time,
   when: '',
   text: id,
   attachments: [],
})

describe('buildThread', () => {
   it('should group messages by day, with the label of each day', () => {
      const days = buildThread(
         [message('a', 'THEM', at(22, 9)), message('b', 'ME', at(22, 10)), message('c', 'THEM', at(23, 9))],
         now
      )

      expect(days.map(day => day.label)).toEqual(['Yesterday', 'Today'])
      expect(days.map(day => day.groups.flatMap(group => group.messages.map(m => m.id)))).toEqual([['a', 'b'], ['c']])
   })

   it('should put the consecutive messages of one sender in one group, and start a new one when the sender changes', () => {
      const [day] = buildThread(
         [
            message('a', 'THEM', at(23, 9)),
            message('b', 'THEM', at(23, 9, 1)),
            message('c', 'ME', at(23, 9, 2)),
            message('d', 'THEM', at(23, 9, 3)),
         ],
         now
      )

      expect(day?.groups.map(group => group.messages.length)).toEqual([2, 1, 1])
      expect(day?.groups.map(group => group.direction)).toEqual(['THEM', 'ME', 'THEM'])
   })

   it('should start a new group after a long silence even from the same sender', () => {
      const [day] = buildThread([message('a', 'THEM', at(23, 8)), message('b', 'THEM', at(23, 11))], now)

      expect(day?.groups).toHaveLength(2)
   })

   it('should start a new group for another person in a group conversation', () => {
      const [day] = buildThread(
         [message('a', 'THEM', at(23, 9), 'Ada'), message('b', 'THEM', at(23, 9, 1), 'Grace')],
         now
      )

      expect(day?.groups.map(group => group.sender)).toEqual(['Ada', 'Grace'])
   })

   it('should make a day of nothing for no message', () => {
      expect(buildThread([], now)).toEqual([])
   })
})

describe('lastOwnIndex', () => {
   it('should find the last message we sent, or nothing', () => {
      expect(lastOwnIndex([message('a', 'THEM', 1), message('b', 'ME', 2), message('c', 'THEM', 3)])).toBe(1)
      expect(lastOwnIndex([message('a', 'THEM', 1)])).toBe(-1)
   })
})
