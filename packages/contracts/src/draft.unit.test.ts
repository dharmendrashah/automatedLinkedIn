import { describe, expect, it } from 'vitest'

import { checkWords, failedReason, overlapOf, voiceSchema } from './draft'

const failing = (text: string, extra: Partial<Parameters<typeof checkWords>[0]> = {}) =>
   checkWords({
      text,
      maxChars: 220,
      ...extra,
   })
      .filter(({ ok }) => !ok)
      .map(({ key }) => key)

describe('checkWords', () => {
   it('should pass an ordinary comment', () => {
      expect(failing('Three days is a big jump. Which step did you remove first?')).toEqual([])
   })

   it.each([
      ['a link', 'Read https://example.com now', ['link']],
      ['a bare domain', 'See acme.io for more', ['link']],
      ['a mention', 'Great point @ada', ['mention']],
      ['an email', 'Write to ada@acme.com', ['link', 'contact']],
      ['a phone number', 'Call +44 20 7946 0958', ['contact']],
      ['a hashtag', 'Love this #growth', ['hashtag']],
      ['two emoji', 'Nice \u{1F600}\u{1F680}', ['emoji']],
   ])('should fail %s', (_name, text, keys) => {
      expect(failing(text)).toEqual(keys)
   })

   it('should fail words that are empty or over the length', () => {
      expect(failing('   ')).toEqual(['length'])
      expect(failing('a'.repeat(221))).toEqual(['length'])
   })

   it('should fail a word the voice avoids, as a whole word only', () => {
      expect(failing('A guarantee is a promise', { avoid: ['guarantee'] })).toEqual(['avoid'])
      expect(failing('Guaranteed fun', { avoid: ['guarantee'] })).toEqual([])
   })

   it('should fail words close to a recent piece, and only check it when recent ones are given', () => {
      const earlier = 'Three days is a big jump. Which step did you remove first?'

      expect(failing('Three days is a big jump. Which step went first?', { recent: [earlier] })).toEqual(['alike'])
      expect(failing('Three days is a big jump. Which step went first?')).toEqual([])
      expect(failing('A very different thought about hiring', { recent: [earlier] })).toEqual([])
   })
})

describe('failedReason', () => {
   it('should name a likeness, call any other failure not suitable, and give nothing when all pass', () => {
      expect(
         failedReason(
            checkWords({
               text: 'Nice',
               maxChars: 10,
               recent: ['Nice'],
            })
         )
      ).toBe('ALIKE')
      expect(
         failedReason(
            checkWords({
               text: 'See acme.io',
               maxChars: 50,
            })
         )
      ).toBe('UNSUITABLE')
      expect(
         failedReason(
            checkWords({
               text: 'Nice',
               maxChars: 50,
            })
         )
      ).toBeNull()
   })
})

describe('overlapOf', () => {
   it('should be 0 for words with nothing in common and 1 for the same words', () => {
      expect(overlapOf('one two three four', 'five six seven eight')).toBe(0)
      expect(overlapOf('one two three four', 'one two three four')).toBe(1)
   })
})

describe('voiceSchema', () => {
   it('should fill the defaults and lower case the words to avoid', () => {
      expect(
         voiceSchema.parse({
            name: 'Agency voice',
            avoid: ['Guarantee'],
         })
      ).toEqual({
         name: 'Agency voice',
         about: '',
         tone: 'friendly',
         language: '',
         avoid: ['guarantee'],
         rules: '',
      })
   })
})
