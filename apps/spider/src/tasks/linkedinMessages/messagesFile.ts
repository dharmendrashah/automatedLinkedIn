import { type Conversation, MESSAGES_CONTRACT_VERSION, type MessagesFile } from '@automatedLinkedIn/contracts'

// A run keeps at most 1 MB per file; this leaves room for the redaction of secrets, which can only make a file longer.
export const MAX_FILE_CHARS = 900_000

export const fileName = (part: number) => (part === 1 ? 'messages.json' : `messages-${part}.json`)

const size = (file: MessagesFile) => JSON.stringify(file).length

// Cuts the oldest messages of a conversation until it fits a file by itself.
const trimmed = (conversation: Conversation, fits: (candidate: Conversation) => boolean) => {
   let kept = conversation.messages

   while (
      kept.length > 0 &&
      !fits({
         ...conversation,
         complete: false,
         messages: kept,
      })
   ) {
      kept = kept.slice(Math.ceil(kept.length / 10))
   }

   return {
      ...conversation,
      complete: false,
      messages: kept,
   }
}

// The conversations as numbered files of the contract, each within `max` characters, in the order they were read.
export const partsOf = (conversations: Conversation[], capturedAt: string, max = MAX_FILE_CHARS) => {
   const parts: MessagesFile[] = []
   const start = (): MessagesFile => ({
      contract: MESSAGES_CONTRACT_VERSION,
      part: parts.length + 1,
      captured_at: capturedAt,
      conversations: [],
   })
   const alone = (conversation: Conversation): boolean =>
      size({
         ...start(),
         conversations: [conversation],
      }) <= max
   let current = start()

   for (const read of conversations) {
      const conversation = alone(read) ? read : trimmed(read, alone)

      if (
         current.conversations.length > 0 &&
         size({
            ...current,
            conversations: [...current.conversations, conversation],
         }) > max
      ) {
         parts.push(current)
         current = start()
      }

      current.conversations.push(conversation)
   }

   if (current.conversations.length > 0) {
      parts.push(current)
   }

   return parts
}
