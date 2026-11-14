import { describe, expect, it, vi } from 'vitest'

import { readReply } from './aiReplyReader'
import { type Call } from './aiWriter'

const price = {
   inputMicros: 1_000_000,
   outputMicros: 2_000_000,
}
const answering =
   (output: unknown): Call =>
   async () => ({
      output,
      model: 'm',
      inputTokens: 100,
      outputTokens: 10,
   })

describe('readReply', () => {
   it('counts a reply only when the AI says positive and is at least 70 sure, and books the call', async () => {
      const got = await readReply(
         'What does it cost?',
         answering({
            label: 'positive',
            confidence: 82,
         }),
         price
      )

      expect(got).toMatchObject({ status: 'POSITIVE' })
      expect(got.status !== 'FAILED' && got.usage.costMicros).toBe(120)
   })

   it('does not count a reply the AI calls something else, or is not sure about, and still books the call', async () => {
      expect(
         await readReply(
            'thanks',
            answering({
               label: 'other',
               confidence: 95,
            }),
            price
         )
      ).toMatchObject({ status: 'NOT_POSITIVE' })
      expect(
         await readReply(
            'hm',
            answering({
               label: 'positive',
               confidence: 69,
            }),
            price
         )
      ).toMatchObject({ status: 'UNSURE' })
      expect(
         await readReply(
            'hm',
            answering({
               label: 'none',
               confidence: 0,
            }),
            price
         )
      ).toMatchObject({ status: 'UNSURE' })
   })

   it('asks once, with only the reply text, and fails quietly when the model does', async () => {
      const call = vi.fn<Call>(async () => {
         throw new Error('down')
      })

      expect(await readReply('Sounds interesting?', call, price)).toEqual({ status: 'FAILED' })
      expect(call).toHaveBeenCalledTimes(1)
      expect(call.mock.calls[0]?.[0].prompt).toContain('Sounds interesting?')
   })
})
