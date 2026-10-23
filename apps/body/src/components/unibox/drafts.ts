import { LIMITS } from './attachments'

// What was typed in each conversation and not sent, by conversation id. Kept on this device, so switching conversation or reloading
// never loses a reply.
export type Drafts = Record<string, string>

export const setDraft = (drafts: Drafts, id: string, text: string): Drafts => {
   if (!text.trim()) {
      if (!(id in drafts)) {
         return drafts
      }

      const { [id]: _removed, ...rest } = drafts

      return rest
   }

   return drafts[id] === text ? drafts : { ...drafts, [id]: text }
}

export const parseDrafts = (raw: unknown): Drafts => {
   if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return {}
   }

   return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>)
         .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
         .map(([id, text]) => [id, text.slice(0, LIMITS.TEXT)])
   )
}
