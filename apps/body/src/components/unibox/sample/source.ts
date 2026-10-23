import { type Attachment, type UniboxAccount, type UniboxConversation } from '../types'

import { sampleAccounts } from './accounts'
import { type MessagesFileShape, accountOfFile, conversationsFromFile } from './fromContract'
import { inventedConversations } from './seed'

export type UniboxData = {
   accounts: UniboxAccount[]
   conversations: UniboxConversation[]
   // True while the messages are examples: the page says so, and nothing is really sent.
   sample: boolean
}

export type SendResult = { ok: true } | { ok: false; reason: string }

// Where the Unibox gets its data and sends a reply. The page knows only this, so a source that reads brain over tRPC takes the
// place of the sample one without a change to any screen.
export type UniboxSource = {
   load: () => Promise<UniboxData>
   send: (account: UniboxAccount, text: string, attachments: Attachment[]) => Promise<SendResult>
}

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
// not. A reply "goes" after a moment; it fails when its text holds /fail, to see how a failure looks.
export const createSampleSource = ({
   now = Date.now,
   loadReal,
   wait = sleep,
   size = 400,
}: Deps = {}): UniboxSource => ({
   load: async () => {
      const file = await loadReal?.().catch(() => undefined)

      if (file && file.conversations.length > 0) {
         const account = accountOfFile(file)

         return {
            accounts: [account],
            conversations: conversationsFromFile(file, account),
            sample: true,
         }
      }

      const accounts = sampleAccounts(now())

      return {
         accounts,
         conversations: inventedConversations(accounts, now(), size),
         sample: true,
      }
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
})
