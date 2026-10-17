import { describe, expect, it } from 'vitest'

import { mergeBySlug, person } from './workflowItem'

describe('mergeBySlug', () => {
   it('should keep each person once, fill missing fields and add up distinct signals', () => {
      const commented = person({
         slug: 'ada',
         url: 'https://www.linkedin.com/in/ada',
         headline: 'VP Growth',
         followers: 900,
         signals: [
            {
               type: 'commented',
               via: 'post-1',
               at: null,
               excerpt: 'Great',
            },
         ],
      })
      const reacted = person({
         slug: 'ada',
         url: 'https://www.linkedin.com/in/ada',
         location: 'London',
         signals: [
            {
               type: 'reacted',
               via: 'post-1',
               at: null,
               excerpt: null,
            },
            {
               type: 'commented',
               via: 'post-1',
               at: null,
               excerpt: 'Great',
            },
         ],
      })

      const [ada, ...rest] = mergeBySlug([commented, reacted])

      expect(rest).toEqual([])
      expect(ada).toMatchObject({
         headline: 'VP Growth',
         location: 'London',
         followers: 900,
      })
      expect(ada.signals.map(({ type }) => type)).toEqual(['commented', 'reacted'])
   })
})
