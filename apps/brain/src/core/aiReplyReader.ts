import { type LabelDef, MIN_AI_CONFIDENCE } from '@automatedLinkedIn/contracts'

import { labelText } from './aiLabeler'
import { type Call, type Price, type Usage } from './aiWriter'

// "Is this reply a positive one?" (.plan/campaign-revenue-pipeline.md). Asked only for a reply the word rules were not sure about. The AI
// gets the text of that one reply and nothing else (no name, company or link); it answers a label and a number, and only a confident
// "positive" counts. The model is reached only through `call`, so a test passes a fake.

export const LABELS: LabelDef[] = [
   {
      name: 'positive',
      meaning: 'the person shows interest: they want to talk, hear more, see a demo or a price, or take a next step',
   },
   {
      name: 'other',
      meaning:
         'anything else: a no, small talk, thanks only, a question that is not about going ahead, an automatic reply, or unclear',
   },
]

export type ReplyRead = { status: 'POSITIVE' | 'NOT_POSITIVE' | 'UNSURE'; usage: Usage } | { status: 'FAILED' }

export const readReply = async (text: string, call: Call, price: Price): Promise<ReplyRead> => {
   const answered = await labelText(text, LABELS, MIN_AI_CONFIDENCE, call, price)

   if (answered.status === 'FAILED') {
      return answered
   }

   if (answered.status === 'UNSURE') {
      return {
         status: 'UNSURE',
         usage: answered.usage,
      }
   }

   return {
      status: answered.label === 'positive' ? 'POSITIVE' : 'NOT_POSITIVE',
      usage: answered.usage,
   }
}
