import { TRPCClientError } from '@trpc/client'

import {
   type AccountState,
   type Attachment,
   type UniboxAccount,
   type UniboxConversation,
   type UniboxMessage,
} from './types'

import { type RouterOutputs, type trpc } from '../../trpc/trpc'
import { type UniboxData, type UniboxSource } from './source'
import { type Upload } from './upload'

// The part of the tRPC client the Unibox uses, as the client of the app gives it (`trpc.useUtils().client`).
export type UniboxClient = ReturnType<typeof trpc.useUtils>['client']

type Wire = RouterOutputs['unibox']
type WireAccount = Wire['accounts'][number]
type WireConversation = Wire['conversations'][number]
type WireMessage = WireConversation['messages'][number]

// Brain's own limit of ids in one call.
const MAX_IDS = 500

// Brain keeps the day and time LinkedIn showed as if they were UTC, so the clock reads the same for the viewer whatever their zone.
export const localClock = (iso: string) => {
   const at = new Date(iso)

   return new Date(
      at.getUTCFullYear(),
      at.getUTCMonth(),
      at.getUTCDate(),
      at.getUTCHours(),
      at.getUTCMinutes()
   ).getTime()
}

const STATES: Record<WireAccount['status'], AccountState> = {
   ACTIVE: 'ACTIVE',
   DISABLED: 'PAUSED',
   BLOCKED: 'RESTRICTED',
   PENDING: 'DISCONNECTED',
   NEEDS_REAUTH: 'DISCONNECTED',
   ERROR: 'DISCONNECTED',
}

const accountOf = (account: WireAccount): UniboxAccount => ({
   id: account.id,
   name: account.displayName ?? account.email,
   handle: account.email,
   headline: '',
   state: STATES[account.status],
   ...(account.messagesReadAt && { lastReadAt: localClock(account.messagesReadAt) }),
   ...(account.imageUrl && { imageUrl: account.imageUrl }),
})

const KINDS: Attachment['kind'][] = ['IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'LINK']

const attachmentOf = ({ kind, name, bytes, kept }: WireMessage['attachments'][number]): Attachment => ({
   kind: KINDS.find(known => known === kind) ?? 'FILE',
   ...(name && { name }),
   ...(bytes !== undefined && { bytes }),
   ...(kept && { kept }),
})

const messageOf = (message: WireMessage): UniboxMessage => ({
   id: message.id,
   direction: message.direction,
   sender: message.sender,
   at: localClock(message.sentAt),
   when: message.when,
   text: message.text,
   attachments: message.attachments.map(attachmentOf),
})

const conversationOf = (conversation: WireConversation): UniboxConversation => {
   const [first] = conversation.participants

   return {
      id: conversation.id,
      accountId: conversation.accountId,
      contact: first ?? { name: conversation.title },
      participants: conversation.participants,
      kind: conversation.kind,
      unread: conversation.unread,
      complete: conversation.complete,
      messages: conversation.messages.map(messageOf),
      messageCount: conversation.messageCount,
      ...(conversation.waitingSince && { waitingSince: localClock(conversation.waitingSince) }),
      ...(conversation.lastReplyAt && { lastReplyAt: localClock(conversation.lastReplyAt) }),
      // Closed by the owner with nothing after it: done as of its last message.
      ...(conversation.done && conversation.lastMessageAt && { doneAt: localClock(conversation.lastMessageAt) }),
   }
}

const groups = (ids: string[]) =>
   Array.from({ length: Math.ceil(ids.length / MAX_IDS) }, (_, index) =>
      ids.slice(index * MAX_IDS, (index + 1) * MAX_IDS)
   )

// How a reply is followed: brain is asked every 2 seconds, up to 3 minutes (the task itself stops after 5).
const POLL_MS = 2000
const POLL_TIMES = 90
// A reply with files may take minutes to go up through the account's proxy: it is followed for up to 10 minutes.
const FILES_POLL_TIMES = 300

const sleep = (ms: number) =>
   new Promise<void>(resolve => {
      setTimeout(resolve, ms)
   })

// The sentence of a refusal brain wrote for the owner; anything else is not shown.
const refusalOf = (error: unknown) =>
   error instanceof TRPCClientError && ['PRECONDITION_FAILED', 'NOT_FOUND'].includes(error.data?.code ?? '')
      ? error.message
      : 'The reply could not be sent. Try again.'

// The Unibox on the owner's real messages, read from brain (.plan/unibox-backend.md) and answered through the account's own browser
// (.plan/unibox-send.md). `upload` sends a file of a reply to brain; without it files cannot be sent. `wait` is only for tests.
type Deps = {
   upload?: Upload
   wait?: (ms: number) => Promise<void>
}

export const createTrpcSource = (client: UniboxClient, { upload, wait = sleep }: Deps = {}): UniboxSource => ({
   load: async (): Promise<UniboxData> => {
      const [accounts, conversations] = await Promise.all([
         client.unibox.accounts.query(),
         client.unibox.conversations.query({}),
      ])

      return {
         accounts: accounts.map(accountOf),
         conversations: conversations.map(conversationOf),
         sample: false,
         canSend: true,
         canRefresh: true,
      }
   },

   open: async id => conversationOf(await client.unibox.conversation.query({ id })),

   mark: async (ids, change) => {
      for (const group of groups(ids)) {
         if ('unread' in change) {
            await client.unibox.setUnread.mutate({ ids: group, unread: change.unread })
         } else {
            await client.unibox.setDone.mutate({ ids: group, done: change.done })
         }
      }
   },

   refresh: accountIds => client.unibox.refresh.mutate(accountIds ? { accountIds } : {}),

   fileLink: async (messageId, index) => (await client.unibox.fileLink.query({ messageId, index })).url,

   send: async (_account, text, attachments, conversationId) => {
      // A link is only text on the page; there is nothing of it to upload.
      if (attachments.some(({ kind }) => kind === 'LINK')) {
         return {
            ok: false,
            reason: 'A link cannot be sent as an attachment. Put it in the words of the reply.',
         }
      }

      const uploadId = attachments.length > 0 ? crypto.randomUUID() : undefined

      for (const attachment of attachments) {
         const label = attachment.name ?? 'A file'

         if (!attachment.file || !upload) {
            return {
               ok: false,
               reason: `${label} is no longer here. Attach it again.`,
            }
         }

         const uploaded = await upload(uploadId ?? '', attachment.file)

         if (!uploaded.ok) {
            return {
               ok: false,
               reason: `${label}: ${uploaded.reason}`,
            }
         }
      }

      const started = await client.unibox.send
         .mutate({ conversationId, text, ...(uploadId && { uploadId }) })
         .catch((error: unknown) => refusalOf(error))

      if (typeof started === 'string') {
         return {
            ok: false,
            reason: started,
         }
      }

      const times = attachments.length > 0 ? FILES_POLL_TIMES : POLL_TIMES

      for (let polls = 0; polls < times; polls += 1) {
         await wait(POLL_MS)

         const reply = await client.unibox.reply.query({ id: started.id }).catch(() => undefined)

         if (reply?.state === 'SENT') {
            return { ok: true }
         }

         if (reply?.state === 'FAILED') {
            return {
               ok: false,
               reason: reply.failure ?? 'LinkedIn did not send the reply.',
            }
         }

         if (reply?.state === 'UNKNOWN') {
            return {
               ok: false,
               unsure: true,
               reason:
                  reply.failure ??
                  'LinkedIn did not show whether the reply was sent. Check the conversation on LinkedIn.',
            }
         }
      }

      return {
         ok: false,
         unsure: true,
         reason: 'No answer came in time. Check the conversation on LinkedIn.',
      }
   },
})
