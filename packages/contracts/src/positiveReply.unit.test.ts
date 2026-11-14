import { describe, expect, it } from 'vitest'

import { REPLY_VALUE_MAX_USD, pipelineOf, replyLeanOf, replyValueSchema } from './positiveReply'

describe('pipelineOf', () => {
   it('multiplies the replies by the monthly worth and by 12', () => {
      expect(pipelineOf(10, 100)).toBe(12_000)
      expect(pipelineOf(30, 250)).toBe(90_000)
   })

   it('shows no figure when the worth is not set, and 0 for no replies once it is', () => {
      expect(pipelineOf(10, null)).toBeNull()
      expect(pipelineOf(0, 100)).toBe(0)
   })

   it('stays a safe integer at the largest worth and a very large number of replies', () => {
      expect(Number.isSafeInteger(pipelineOf(100_000, REPLY_VALUE_MAX_USD) ?? Number.NaN)).toBe(true)
   })
})

describe('replyValueSchema', () => {
   it('takes a whole number of USD from 1 up to the cap, and nothing else', () => {
      expect(replyValueSchema.safeParse(100).success).toBe(true)
      expect(replyValueSchema.safeParse(0).success).toBe(false)
      expect(replyValueSchema.safeParse(12.5).success).toBe(false)
      expect(replyValueSchema.safeParse(REPLY_VALUE_MAX_USD + 1).success).toBe(false)
   })
})

describe('replyLeanOf', () => {
   it('is a sure yes for a strong phrase of interest', () => {
      expect(replyLeanOf('Sounds good, send me the details.')).toBe('yes')
      expect(replyLeanOf("Yes, I'm interested!")).toBe('yes')
      expect(replyLeanOf("Let's talk next week")).toBe('yes')
   })

   it('is a sure no for a no, an away reply, a request to stop, or nothing written', () => {
      expect(replyLeanOf('Not interested, thanks')).toBe('no')
      expect(replyLeanOf('I am out of office until Monday')).toBe('no')
      expect(replyLeanOf('Please stop messaging me')).toBe('no')
      expect(replyLeanOf('   ')).toBe('no')
   })

   it('is not sure about a weak word, a hedge, a question or a reply no rule reads', () => {
      expect(replyLeanOf('Not sure')).toBe('unsure')
      expect(replyLeanOf('sure')).toBe('unsure')
      expect(replyLeanOf("I'm not sure I'm interested")).toBe('unsure')
      expect(replyLeanOf('Interested, but not now')).toBe('no')
      expect(replyLeanOf('What does it cost?')).toBe('unsure')
      expect(replyLeanOf('Gracias por el mensaje, cuéntame más')).toBe('unsure')
   })
})
