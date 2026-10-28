import { type UniboxConversation } from '../types'

import { notActiveReason } from '../newMessage'
import { type UniboxSource } from '../source'
import { sampleAccounts } from './accounts'
import { type MessagesFileShape, accountOfFile, conversationsFromFile } from './fromContract'
import { sampleRecipients, startedKey } from './recipients'
import { inventedConversations } from './seed'

type Deps = {
   now?: () => number
   // The real messages file, when there is one (development only; see real.ts).
   loadReal?: () => Promise<MessagesFileShape | undefined>
   wait?: (ms: number) => Promise<void>
   size?: number
}

const NOT_SENDING = {
   PAUSED: 'This account is paused, so nothing can be sent from it.',
   DISCONNECTED: 'This account is disconnected, so nothing can be sent from it.',
   RESTRICTED: 'LinkedIn restricted this account, so nothing can be sent from it.',
} as const

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// Example data for the Unibox: the conversations of the real messages file when there is one (and only those), invented ones when
// not. A reply "goes" after a moment; it fails when its text holds /fail, to see how a failure looks. A first message to one of the
// invented connections starts a conversation the same way.
export const createSampleSource = ({ now = Date.now, loadReal, wait = sleep, size = 400 }: Deps = {}): UniboxSource => {
   let shown: UniboxConversation[] = []
   let accountIds: string[] = []
   // The conversations begun from the page: by the person's slug the id, and by the id the conversation.
   const startedIds = new Map<string, string>()
   const started = new Map<string, UniboxConversation>()

   return {
      load: async () => {
         const file = await loadReal?.().catch(() => undefined)

         if (file && file.conversations.length > 0) {
            const account = accountOfFile(file)

            shown = conversationsFromFile(file, account)
            accountIds = [account.id]

            return {
               accounts: [account],
               conversations: shown,
               sample: true,
               canSend: true,
               canStart: true,
               canRefresh: false,
            }
         }

         const accounts = sampleAccounts(now())

         shown = inventedConversations(accounts, now(), size)
         accountIds = accounts.map(({ id }) => id)

         return {
            accounts,
            conversations: shown,
            sample: true,
            canSend: true,
            canStart: true,
            canRefresh: false,
         }
      },
      // The sample keeps nothing: a mark lives in the page until it is reloaded.
      mark: async () => undefined,
      open: async id => started.get(id),
      refresh: async () => ({ started: 0, skipped: [] }),
      recipients: async query => sampleRecipients(accountIds, shown, startedIds, query),
      start: async (account, slug, text) => {
         await wait(700 + Math.random() * 700)

         const blocked = notActiveReason(account)

         if (blocked) {
            return { ok: false, reason: blocked }
         }

         if (text.includes('/fail')) {
            return { ok: false, reason: 'The sample message failed on purpose: its text holds /fail.' }
         }

         const person = sampleRecipients([account.id], shown, startedIds, '').find(item => item.slug === slug)

         if (!person || person.blocked) {
            return { ok: false, reason: 'This person cannot be written to.' }
         }

         const at = now()
         const contact = { name: person.name, profileUrl: `https://www.linkedin.com/in/${slug}/` }
         const id = `sample-${startedIds.size + 1}`

         startedIds.set(startedKey(account.id, slug), id)
         started.set(id, {
            id,
            accountId: account.id,
            contact,
            participants: [contact],
            kind: 'DIRECT',
            unread: false,
            complete: true,
            messageCount: 1,
            messages: [
               { id: `${id}-1`, direction: 'ME', sender: 'You', at, when: '', text: text.trim(), attachments: [] },
            ],
         })

         return { ok: true, conversationId: id }
      },
      send: async (account, text) => {
         await wait(700 + Math.random() * 700)

         if (account.state !== 'ACTIVE') {
            return { ok: false, reason: NOT_SENDING[account.state] }
         }

         return text.includes('/fail')
            ? { ok: false, reason: 'The sample reply failed on purpose: its text holds /fail.' }
            : { ok: true }
      },
   }
}
