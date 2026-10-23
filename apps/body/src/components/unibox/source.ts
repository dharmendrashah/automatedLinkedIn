import { type Attachment, type UniboxAccount, type UniboxConversation } from './types'

export type UniboxData = {
   accounts: UniboxAccount[]
   conversations: UniboxConversation[]
   // True while the messages are examples: the page says so, and nothing is really sent.
   sample: boolean
   // Whether a reply can be sent from the page; when not, the composer says so and keeps the draft.
   canSend: boolean
   // Whether the messages can be read again from LinkedIn on request.
   canRefresh: boolean
}

export type SendResult = { ok: true } | { ok: false; reason: string }

export type RefreshResult = {
   started: number
   skipped: Array<{ accountId: string; reason: string }>
}

// Where the Unibox gets its data and changes it. The page knows only this: the sample one for development, and the one that reads
// brain over tRPC for real messages.
export type UniboxSource = {
   load: () => Promise<UniboxData>
   // The owner's own marks, kept with the data. Nothing is changed on LinkedIn.
   mark: (ids: string[], change: { unread: boolean } | { done: boolean }) => Promise<void>
   send: (account: UniboxAccount, text: string, attachments: Attachment[]) => Promise<SendResult>
   // The whole conversation, for a source that lists only its latest messages (undefined when it already has it all).
   open: (id: string) => Promise<UniboxConversation | undefined>
   // Asks for the messages to be read again.
   refresh: (accountIds?: string[]) => Promise<RefreshResult>
}
