import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { callModel } from './aiModel'

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }))

vi.mock('ai', () => ({
   Output: { object: vi.fn(({ schema }: { schema: unknown }) => schema) },
   generateText: mocks.generateText,
}))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: () => () => 'google-model' }))
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: () => () => 'compatible-model' }))
vi.mock('env', () => ({
   AI_API_KEY: 'key',
   AI_BASE_URL: '',
   AI_MODEL: 'gemini-3.6-flash',
   AI_PRICE_INPUT_MICROS: 750_000,
   AI_PRICE_OUTPUT_MICROS: 3_750_000,
   AI_PROVIDER: 'google',
}))

describe('callModel', () => {
   beforeEach(() => {
      mocks.generateText.mockReset()
      mocks.generateText.mockResolvedValue({
         output: { action: 'WRITE' },
         usage: {
            inputTokens: 100,
            outputTokens: 700,
         },
      })
   })

   it('should leave room for a thinking model to think before it answers, and report the tokens it used', async () => {
      const result = await callModel({
         system: 's',
         prompt: 'p',
         schema: z.object({}),
         maxOutputTokens: 174,
      })

      expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 174 + 2048 }))
      expect(result).toEqual({
         output: { action: 'WRITE' },
         model: 'gemini-3.6-flash',
         inputTokens: 100,
         outputTokens: 700,
      })
   })
})
