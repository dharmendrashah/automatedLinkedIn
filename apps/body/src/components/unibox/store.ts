import { type Attachment, type UniboxConversation, type UniboxMessage } from './types'

import { type Waiting } from '../posting/publication'

export type Action =
   | { type: 'READ'; ids: string[] }
   | { type: 'UNREAD'; ids: string[] }
   | { type: 'DONE'; ids: string[]; now: number }
   | { type: 'UNDONE'; ids: string[] }
   | { type: 'SEND'; id: string; text: string; attachments: Attachment[]; now: number }
   // A first message to a connection: the conversation not begun yet enters the list (see newMessage.ts).
   | { type: 'START'; conversation: UniboxConversation }
   // A conversation not begun yet that the owner left without writing: it goes.
   | { type: 'DISCARD'; id: string }
   // The first message is stored: the real conversation takes the place of the stand-in.
   | { type: 'REPLACE'; id: string; conversation: UniboxConversation }
   | { type: 'UNDO_SEND'; id: string }
   // How much of the files of the reply is uploaded, in percent.
   | { type: 'PROGRESS'; id: string; percent: number }
   // The reply is on its way: brain has it (its id), from when.
   | { type: 'STARTED'; id: string; replyId: string; since: number }
   // Brain says why the reply is queued and from when it can start, or (no `wait`) that it is not waiting any more.
   | { type: 'WAITING'; id: string; wait: Waiting | undefined }
   // LinkedIn took the reply. The message is shown when it is stored; until then the reply stays as it is, marked done.
   | { type: 'SENT'; id: string }
   // The wait for the stored message is over. When it did not come (`stored` false) the reply is shown as a message of ours until the
   // next read brings the real one.
   | { type: 'FINISHED'; id: string; now: number; stored: boolean }
   | { type: 'FAIL'; id: string; reason: string; unsure?: boolean }
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

// A stand-in of a first message with nothing in it: no message, none on its way, none that failed.
const bare = (conversation: UniboxConversation) =>
   conversation.starting !== undefined &&
   conversation.messages.length === 0 &&
   !conversation.sending &&
   !conversation.failed

const dropped = (state: UniboxConversation[], id: string) => {
   const target = state.find(conversation => conversation.id === id)

   return target && bare(target) ? state.filter(conversation => conversation.id !== id) : state
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
      case 'START':
         return state.some(conversation => conversation.id === action.conversation.id)
            ? state
            : [action.conversation, ...state]
      case 'DISCARD':
         return dropped(state, action.id)
      case 'REPLACE': {
         // The real conversation may already be in the list (a reload brought it): then only the stand-in goes.
         const rest = state.filter(conversation => conversation.id !== action.id)

         return rest.some(conversation => conversation.id === action.conversation.id)
            ? rest
            : [action.conversation, ...rest]
      }
      case 'UNDO_SEND':
         return change(state, [action.id], c => (c.sending ? without(c, 'sending') : c))
      case 'PROGRESS':
         return change(state, [action.id], c =>
            c.sending && c.sending.progress !== action.percent
               ? {
                    ...c,
                    sending: {
                       ...c.sending,
                       progress: action.percent,
                    },
                 }
               : c
         )
      case 'STARTED':
         return change(state, [action.id], c =>
            c.sending
               ? {
                    ...c,
                    sending: {
                       ...c.sending,
                       replyId: action.replyId,
                       since: action.since,
                    },
                 }
               : c
         )
      case 'WAITING':
         return change(state, [action.id], c => {
            const { sending } = c
            const same =
               sending?.wait?.reason === action.wait?.reason &&
               sending?.wait?.until === action.wait?.until &&
               sending?.wait?.zone === action.wait?.zone

            if (!sending || same) {
               return c
            }

            return {
               ...c,
               sending: action.wait ? { ...sending, wait: action.wait } : without(sending, 'wait'),
            }
         })
      case 'SENT':
         return change(state, [action.id], c =>
            c.sending && !c.sending.done
               ? {
                    ...c,
                    unread: false,
                    sending: {
                       ...c.sending,
                       done: true,
                    },
                 }
               : c
         )
      case 'FINISHED':
         return change(state, [action.id], c => {
            if (!c.sending) {
               return c
            }

            if (action.stored) {
               return without(c, 'sending')
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
                       ...(action.unsure && { unsure: true }),
                       ...(c.sending.replyId && { replyId: c.sending.replyId }),
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
