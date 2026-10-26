import { describe, expect, it } from 'vitest'

import { summaryOf } from './summary'

describe('summaryOf', () => {
   it('should give the first words and the kind of attachment', () => {
      expect(
         summaryOf([
            {
               id: 't1',
               type: 'TEXT',
               text: 'Launching our new product today.\n\nMore soon.',
            },
            {
               id: 'p1',
               type: 'PHOTOS',
               items: [
                  { id: 'a', name: 'a.jpg', bytes: 1 },
                  { id: 'b', name: 'b.jpg', bytes: 1 },
               ],
            },
         ])
      ).toEqual({
         words: 'Launching our new product today. More soon.',
         attachment: '2 photos',
      })
   })

   it('should name a video and a link, and say so when there are no words', () => {
      expect(summaryOf([{ id: 'v1', type: 'VIDEO', file: { id: 'f', name: 'a.mp4', bytes: 1 } }]).attachment).toBe('Video')
      expect(summaryOf([{ id: 'l1', type: 'LINK', url: 'https://example.com/a' }])).toEqual({
         words: 'No words yet',
         attachment: 'Link to example.com',
      })
      expect(summaryOf([])).toEqual({
         words: 'Empty draft',
         attachment: undefined,
      })
   })

   it('should shorten long text', () => {
      const { words } = summaryOf([{ id: 't1', type: 'TEXT', text: 'word '.repeat(100) }])

      expect(Array.from(words).length).toBeLessThanOrEqual(91)
      expect(words.endsWith('…')).toBe(true)
   })
})
