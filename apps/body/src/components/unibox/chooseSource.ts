import { type UniboxSource } from './source'

// In development a messages file in public/ is shown as it is, so the page can be tried without a read; with no file, and
// everywhere else, the owner's real messages are. The choice is made when the data loads, and what the owner does after goes to
// the source that showed it.
export const withDevFile = (file: UniboxSource, real: UniboxSource, hasFile: () => Promise<boolean>): UniboxSource => {
   let active = real

   return {
      load: async () => {
         active = (await hasFile().catch(() => false)) ? file : real

         return active.load()
      },
      mark: (ids, change) => active.mark(ids, change),
      open: id => active.open(id),
      refresh: accountIds => active.refresh(accountIds),
      fileLink: (messageId, index) =>
         active.fileLink ? active.fileLink(messageId, index) : Promise.reject(new Error('No file')),
      send: (account, text, attachments, conversationId, events) =>
         active.send(account, text, attachments, conversationId, events),
      follow: replyId => (active.follow ? active.follow(replyId) : Promise.reject(new Error('Nothing to follow'))),
      dismissReply: replyId => active.dismissReply?.(replyId) ?? Promise.resolve(),
      recipients: search => active.recipients?.(search) ?? Promise.resolve({ people: [], total: 0 }),
      recipient: (accountId, slug) => active.recipient?.(accountId, slug) ?? Promise.resolve(null),
      start: (account, slug, text, events) =>
         active.start?.(account, slug, text, events) ??
         Promise.resolve({ ok: false, reason: 'A new conversation cannot be started from here.' }),
   }
}
