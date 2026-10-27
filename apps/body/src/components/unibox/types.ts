// What the Unibox shows. The shapes follow `messages.json` (packages/contracts/src/messages.ts), with the account the conversation
// belongs to, the state the owner gives it here, and a time (epoch milliseconds) on every message so they can be ordered and aged.

export type AccountState = 'ACTIVE' | 'PAUSED' | 'DISCONNECTED' | 'RESTRICTED'

export type UniboxAccount = {
   id: string
   // The full name of the profile; two accounts can share it, so `handle` tells them apart.
   name: string
   handle: string
   headline: string
   state: AccountState
   imageUrl?: string
   // When the worker last read this account's messages.
   lastReadAt?: number
   // When the next automatic read of this account's messages is due, as an ISO time.
   nextReadAt?: string
}

export type AttachmentKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'LINK'

export type Attachment = {
   kind: AttachmentKind
   name?: string
   bytes?: number
   // True when the platform keeps the file, so it can be opened (a link is asked for when it is).
   kept?: boolean
   // The file itself, kept until the reply is sent so it can be uploaded; a reply that is only shown (from LinkedIn) has none.
   file?: File
}

export type Person = {
   name: string
   profileUrl?: string
   // The profile picture as LinkedIn's page showed it; shown over the initials when it loads.
   imageUrl?: string
}

export type UniboxMessage = {
   id: string
   direction: 'ME' | 'THEM'
   sender: string
   at: number
   // The time as LinkedIn showed it ("Jan 25, 2024 5:18 PM").
   when: string
   text: string
   attachments: Attachment[]
}

export type UniboxConversation = {
   id: string
   accountId: string
   contact: Person
   participants: Person[]
   kind: 'DIRECT' | 'GROUP'
   unread: boolean
   // False when only part of the conversation was read: older messages are missing.
   complete: boolean
   messages: UniboxMessage[]
   // How many messages the conversation has, when `messages` holds only the latest ones (the list); the rest load when it opens.
   messageCount?: number
   // What the whole conversation says, kept by the server for when `messages` is only the latest few.
   waitingSince?: number
   lastReplyAt?: number
   // When the owner closed it without replying; a message newer than this brings it back.
   doneAt?: number
   // The owner's reply, being sent (it can still be undone until it is on its way). `progress` is how much of the files is uploaded;
   // `replyId` and `since` say it is on its way (brain has it, from when); `done` says LinkedIn took it and the message is being shown.
   sending?: {
      text: string
      attachments: Attachment[]
      at: number
      progress?: number
      replyId?: string
      since?: number
      done?: boolean
   }
   // The owner's reply that did not go, kept so it can be sent again; `replyId` is brain's, so a dismissal is kept after a reload.
   failed?: { reason: string; text: string; attachments: Attachment[]; unsure?: boolean; replyId?: string }
}

export type ConversationStatus = 'REPLYING' | 'FAILED' | 'DONE' | 'NEEDS_REPLY' | 'REPLIED' | 'NONE'

export type View = 'ALL' | 'NEEDS_REPLY' | 'UNREAD' | 'REPLIED' | 'DRAFTS' | 'FAILED' | 'DONE'

export type Sort = 'NEWEST' | 'WAITING'
