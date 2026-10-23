import { type Attachment, type UniboxConversation, type UniboxMessage } from './types'

export type Action =
   | { type: 'READ'; ids: string[] }
   | { type: 'UNREAD'; ids: string[] }
   | { type: 'DONE'; ids: string[]; now: number }
   | { type: 'UNDONE'; ids: string[] }
   | { type: 'SEND'; id: string; text: string; attachments: Attachment[]; now: number }
   | { type: 'UNDO_SEND'; id: string }
   | { type: 'SENT'; id: string; now: number }
   | { type: 'FAIL'; id: string; reason: string }
   | { type: 'DISMISS_FAILED'; id: string }
   | { type: 'RECEIVE'; id: string; message: UniboxMessage }
   // The whole conversation arrived, for a list that held only its latest messages.
   | { type: 'OPENED'; id: string; conversation: UniboxConversation }

// Changes the conversations named and gives the same list back when nothing changed, so the screen does not redraw for nothing.
const change = (
   state: UniboxConversation[],
   ids: string[],
   apply: (conversation: UniboxConversation) => UniboxConversation
) => {
   const wanted = new Set(ids)
   let changed = false
   const next = state.map(conversation => {
      if (!wanted.has(conversation.id)) {
         return conversation
      }

      const updated = apply(conversation)

      changed ||= updated !== conversation

      return updated
   })

   return changed ? next : state
}

const without = <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> => {
   const { [key]: _removed, ...rest } = value

   return rest
}

// What the owner does to the conversations, and what arrives. The reply is held as "sending" first, so it can be undone, and only
// a "sent" puts it in the conversation. Reading changes nothing but the unread mark.
export const reduce = (state: UniboxConversation[], action: Action): UniboxConversation[] => {
   switch (action.type) {
      case 'READ':
         return change(state, action.ids, c => (c.unread ? { ...c, unread: false } : c))
      case 'UNREAD':
         return change(state, action.ids, c => (c.unread ? c : { ...c, unread: true }))
      case 'DONE':
         return change(state, action.ids, c => ({ ...c, doneAt: action.now }))
      case 'UNDONE':
         return change(state, action.ids, c => (c.doneAt === undefined ? c : without(c, 'doneAt')))
      case 'SEND': {
         const text = action.text.trim()

         if (!text && action.attachments.length === 0) {
            return state
         }

         return change(state, [action.id], c =>
            c.sending
               ? c
               : {
                    ...without(c, 'failed'),
                    sending: {
                       text,
                       attachments: action.attachments,
                       at: action.now,
                    },
                 }
         )
      }
      case 'UNDO_SEND':
         return change(state, [action.id], c => (c.sending ? without(c, 'sending') : c))
      case 'SENT':
         return change(state, [action.id], c => {
            if (!c.sending) {
               return c
            }

            const message: UniboxMessage = {
               id: `sent-${c.id}-${action.now}`,
               direction: 'ME',
               sender: 'You',
               at: action.now,
               when: '',
               text: c.sending.text,
               attachments: c.sending.attachments,
            }

            return {
               ...without(c, 'sending'),
               unread: false,
               messages: [...c.messages, message],
            }
         })
      case 'FAIL':
         return change(state, [action.id], c =>
            c.sending
               ? {
                    ...without(c, 'sending'),
                    failed: {
                       reason: action.reason,
                       text: c.sending.text,
                       attachments: c.sending.attachments,
                    },
                 }
               : c
         )
      case 'DISMISS_FAILED':
         return change(state, [action.id], c => (c.failed ? without(c, 'failed') : c))
      case 'OPENED':
         return change(state, [action.id], c => ({
            ...c,
            messages: action.conversation.messages,
            complete: action.conversation.complete,
            ...(action.conversation.messageCount !== undefined && { messageCount: action.conversation.messageCount }),
         }))
      case 'RECEIVE':
         return change(state, [action.id], c => ({
            ...c,
            unread: true,
            messages: [...c.messages, action.message],
         }))
   }
}
