import { type Attachment, type ConversationStatus, type UniboxConversation, type UniboxMessage } from './types'

export const lastMessage = (conversation: UniboxConversation): UniboxMessage | undefined => conversation.messages.at(-1)

// Where the conversation stands for the owner. Reading never changes it: only a message, a reply or "done" does.
export const statusOf = (conversation: UniboxConversation): ConversationStatus => {
   if (conversation.sending) {
      return 'REPLYING'
   }

   if (conversation.failed) {
      return 'FAILED'
   }

   const last = lastMessage(conversation)

   if (!last) {
      return 'NONE'
   }

   if (last.direction === 'ME') {
      return 'REPLIED'
   }

   return conversation.doneAt !== undefined && conversation.doneAt >= last.at ? 'DONE' : 'NEEDS_REPLY'
}

// When the newest message we sent went, or undefined when we never replied.
export const lastReplyAt = (conversation: UniboxConversation) =>
   conversation.messages.findLast(message => message.direction === 'ME')?.at

// Since when they have waited for an answer: the first of their messages after our last one.
export const waitingSince = (conversation: UniboxConversation) => {
   const { messages } = conversation

   if (messages.at(-1)?.direction !== 'THEM') {
      return undefined
   }

   let since = messages.length - 1

   while (since > 0 && messages[since - 1]?.direction === 'THEM') {
      since -= 1
   }

   return messages[since]?.at
}

const PLACEHOLDERS: Record<Attachment['kind'], (attachment: Attachment) => string> = {
   IMAGE: () => '[Image]',
   VIDEO: () => '[Video]',
   AUDIO: () => '[Voice note]',
   FILE: ({ name }) => `[File${name ? `: ${name}` : ''}]`,
   LINK: () => '[Link]',
}

// The last words of the conversation on one line; a message with no words says what it holds.
export const previewOf = (conversation: UniboxConversation) => {
   const last = lastMessage(conversation)

   if (!last) {
      return {
         from: 'THEM' as const,
         text: '',
      }
   }

   const words = last.text.replace(/\s+/g, ' ').trim()
   const [first] = last.attachments

   return {
      from: last.direction,
      text: words || (first ? PLACEHOLDERS[first.kind](first) : ''),
   }
}
