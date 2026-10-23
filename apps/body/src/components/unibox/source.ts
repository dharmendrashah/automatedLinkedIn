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

// `unsure`: the reply may have been sent (LinkedIn did not show whether), so sending it again asks the owner first.
export type SendResult = { ok: true } | { ok: false; reason: string; unsure?: boolean }

// What happens to a reply while it is sent, for the page to show: how much of the files is uploaded (percent), and brain having it
// (its id), from which on it can be followed, also after a reload.
export type SendEvents = {
   progress?: (percent: number) => void
   started?: (replyId: string) => void
}

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
   send: (
      account: UniboxAccount,
      text: string,
      attachments: Attachment[],
      conversationId: string,
      events?: SendEvents
   ) => Promise<SendResult>
   // The whole conversation, for a source that lists only its latest messages (undefined when it already has it all).
   open: (id: string) => Promise<UniboxConversation | undefined>
   // Asks for the messages to be read again.
   refresh: (accountIds?: string[]) => Promise<RefreshResult>
   // A short link to open the kept file of a message (its first, second... attachment); absent for a source that keeps none.
   fileLink?: (messageId: string, index: number) => Promise<string>
   // Follows a reply brain has until it ends, as `send` does after it started it; for a reply that was on its way when the page loaded.
   follow?: (replyId: string) => Promise<SendResult>
   // Keeps that the owner dismissed a reply that did not go, so it is not shown after a reload.
   dismissReply?: (replyId: string) => Promise<void>
}
