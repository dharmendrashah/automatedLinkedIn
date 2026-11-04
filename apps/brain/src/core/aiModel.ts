import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { Output, generateText } from 'ai'

import { AI_API_KEY, AI_BASE_URL, AI_MODEL, AI_PRICE_INPUT_MICROS, AI_PRICE_OUTPUT_MICROS, AI_PROVIDER } from 'env'

import { type Call, type Pack, type Price, type Voice, type WriteSettings, type Written, writeWords } from './aiWriter'

// The one file that reaches a model (.plan/lead-pipeline-p4-ai-drafts.md). With no provider set up, With AI is off and nothing here runs.

const TIMEOUT_MS = 20_000

export const aiConfigured = () =>
   AI_PROVIDER !== '' &&
   AI_MODEL !== '' &&
   AI_API_KEY !== '' &&
   (AI_PROVIDER !== 'openai-compatible' || AI_BASE_URL !== '')

const modelOf = () =>
   AI_PROVIDER === 'google'
      ? createGoogleGenerativeAI({ apiKey: AI_API_KEY })(AI_MODEL)
      : createOpenAICompatible({
           name: 'ai',
           apiKey: AI_API_KEY,
           baseURL: AI_BASE_URL,
        })(AI_MODEL)

export const callModel: Call = async ({ system, prompt, schema, maxOutputTokens }) => {
   const { output, usage } = await generateText({
      model: modelOf(),
      system,
      prompt,
      output: Output.object({ schema }),
      maxRetries: 0,
      timeout: TIMEOUT_MS,
      maxOutputTokens,
   })

   return {
      output,
      model: AI_MODEL,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
   }
}

export const aiPrice = (): Price => ({
   inputMicros: AI_PRICE_INPUT_MICROS,
   outputMicros: AI_PRICE_OUTPUT_MICROS,
})

export const writeWithAi = (pack: Pack, voice: Voice, settings: WriteSettings): Promise<Written> =>
   writeWords(pack, voice, settings, callModel, aiPrice())
