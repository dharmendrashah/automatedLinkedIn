import { describe, expect, it } from 'vitest'

import { type PostBlock, taskInputOf } from '@automatedLinkedIn/contracts'

import { POST_LIMITS, WAIT, budgetWait, contentProblem, limitProblem } from './postPublication.rules'

const HOUR = 60 * 60 * 1000
const text = (value: string): PostBlock => ({
   id: 't1',
   type: 'TEXT',
   text: value,
})
const photos = (keyed = true): PostBlock => ({
   id: 'p1',
   type: 'PHOTOS',
   items: [
      {
         id: '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34',
         name: 'a b.jpg',
         bytes: 1000,
         ...(keyed && { key: 'posts/u1/0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34/a b.jpg' }),
      },
   ],
})
const link: PostBlock = {
   id: 'l1',
   type: 'LINK',
   url: 'https://example.com/a',
}

describe('limitProblem', () => {
   it('should accept a time that is at least an hour from every other post and keeps three in 24 hours', () => {
      expect(limitProblem([], 0)).toBeUndefined()
      expect(limitProblem([0, 2 * HOUR], 4 * HOUR)).toBeUndefined()
      expect(limitProblem([0, HOUR], 2 * HOUR)).toBeUndefined()
   })

   it('should refuse a time less than an hour from another post, before or after it', () => {
      expect(limitProblem([HOUR], HOUR + 59 * 60 * 1000)).toMatch(/an hour/)
      expect(limitProblem([HOUR], HOUR - 59 * 60 * 1000)).toMatch(/an hour/)
   })

   it('should refuse a fourth post in 24 hours, wherever the new one falls among the others', () => {
      const three = [0, 2 * HOUR, 4 * HOUR]

      expect(limitProblem(three, 6 * HOUR)).toMatch(/3 posts in 24 hours/)
      expect(limitProblem(three, -2 * HOUR)).toMatch(/3 posts in 24 hours/)
      expect(limitProblem(three, 6 * HOUR + 24 * HOUR)).toBeUndefined()
      expect(limitProblem([0, 2 * HOUR], 4 * HOUR)).toBeUndefined()
   })

   it('should say what the limits are in one place', () => {
      expect(POST_LIMITS).toMatchObject({
         perDay: 3,
         gapMs: HOUR,
      })
   })
})

describe('budgetWait', () => {
   it('should say the account is waiting for its next slot after a session, and for its hours or its time when those are the reason', () => {
      expect(budgetWait('TOO_SOON')).toBe(WAIT.SLOT)
      expect(budgetWait('GAP')).toBe(WAIT.SLOT)
      expect(budgetWait('OUTSIDE_OFFICE')).toBe(WAIT.HOURS)
      expect(budgetWait('DAY_FULL')).toBe(WAIT.TIME)
      expect(budgetWait('BACKGROUND_FULL')).toBe(WAIT.TIME)
   })

   it('should only use fixed sentences, none naming the data supplier', () => {
      expect(Object.values(WAIT).every(sentence => sentence.startsWith('Waiting for ') && sentence.endsWith('.'))).toBe(
         true
      )
      expect(JSON.stringify(WAIT).toLowerCase()).not.toMatch(/mindcase|apify/)
   })
})

describe('contentProblem', () => {
   it('should accept words, or a file that was uploaded, or a link', () => {
      expect(contentProblem([text('Hello')])).toBeUndefined()
      expect(contentProblem([photos()])).toBeUndefined()
      expect(contentProblem([link])).toBeUndefined()
   })

   it('should refuse a post with nothing in it, and one whose file is still uploading', () => {
      expect(contentProblem([])).toMatch(/words or a file/)
      expect(contentProblem([text('')])).toMatch(/words or a file/)
      expect(contentProblem([text('Hi'), photos(false)])).toMatch(/uploading/)
   })
})

describe('taskInputOf', () => {
   it('should join the words, and put a link after them on a line of its own', () => {
      expect(taskInputOf([text('One'), text('Two'), link])).toEqual({
         text: 'One\n\nTwo\n\nhttps://example.com/a',
         files: [],
      })
      expect(taskInputOf([link]).text).toBe('https://example.com/a')
   })

   it('should tell the task each file by its id, a safe name and its kind, never by where it is kept', () => {
      expect(taskInputOf([text('Look'), photos()])).toEqual({
         text: 'Look',
         files: [
            {
               id: '0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34',
               name: 'a b.jpg',
               kind: 'PHOTOS',
            },
         ],
      })
   })
})
