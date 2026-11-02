import { describe, expect, it } from 'vitest'

import { moodOf } from './mood'

describe('moodOf', () => {
   it.each([
      ['Yes, sounds good, let us talk', 'positive'],
      ["I'd love to hear more, send me details", 'positive'],
      ['Thanks, tell me more', 'positive'],
      ['Not interested, thanks', 'negative'],
      ['No thanks', 'negative'],
      ['no', 'negative'],
      ['This is spam', 'negative'],
      ['Please remove me from your list', 'unsubscribe'],
      ["Don't contact me again", 'unsubscribe'],
      ['I am out of office until Monday', 'out_of_office'],
      ['How much does it cost?', 'question'],
      ['Thank you for connecting', 'neutral'],
      ['', 'neutral'],
   ])('should read "%s" as %s', (text, mood) => {
      expect(moodOf(text).mood).toBe(mood)
   })

   it('should let a negation win over a later positive word', () => {
      expect(moodOf('Not interested, but sure, good luck').mood).toBe('negative')
   })

   it('should give a fixed sentence and never repeat the words', () => {
      expect(moodOf('Not interested in your secret offer').reason).toBe('Words that mean no.')
   })
})
