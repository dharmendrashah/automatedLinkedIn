import { z } from 'zod'

import { type Form, STEPS, type StepId, emptyForm } from './steps'

export type Draft = {
   form: Form
   done: StepId[]
}

const KEY = 'outreach-chat-draft'

const draftSchema = z.object({
   form: z.object({
      name: z.string(),
      phrases: z.array(z.string()),
      titles: z.array(z.string()),
      locations: z.array(z.string()),
      icpId: z.string(),
      accountMode: z.enum(['all', 'pick']),
      accountIds: z.array(z.string()),
      note: z.string(),
      message: z.string(),
      reactions: z.boolean(),
      comments: z.enum(['off', 'texts']),
      texts: z.string(),
      time: z.string(),
      timeZone: z.string(),
      handOffUrl: z.string(),
      postsPerDay: z.number().nullable(),
   }),
   done: z.array(z.custom<StepId>(value => STEPS.some(({ id }) => id === value))),
})

export const freshDraft = (timeZone: string): Draft => ({
   form: emptyForm(timeZone),
   done: [],
})

// Stored text that is missing, old or edited by hand starts a fresh chat instead of breaking the page.
export const parseDraft = (raw: string | null, timeZone: string): Draft => {
   try {
      const parsed = draftSchema.safeParse(raw === null ? null : JSON.parse(raw))

      return parsed.success ? parsed.data : freshDraft(timeZone)
   } catch {
      return freshDraft(timeZone)
   }
}

// Answers live in sessionStorage so a refresh keeps them; a closed tab does not. Storage may be blocked, so every call is guarded.
export const loadDraft = (timeZone: string) => {
   try {
      return parseDraft(sessionStorage.getItem(KEY), timeZone)
   } catch {
      return freshDraft(timeZone)
   }
}

export const saveDraft = (draft: Draft) => {
   try {
      sessionStorage.setItem(KEY, JSON.stringify(draft))
   } catch {
      // Private mode or a full store: the chat still works, it just does not survive a refresh.
   }
}

export const clearDraft = () => {
   try {
      sessionStorage.removeItem(KEY)
   } catch {
      // Nothing was stored.
   }
}
