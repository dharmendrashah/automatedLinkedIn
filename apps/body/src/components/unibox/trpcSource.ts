import { TRPCClientError } from '@trpc/client'

import {
   type AccountState,
   type Attachment,
   type UniboxAccount,
   type UniboxConversation,
   type UniboxMessage,
} from './types'

import { type RouterOutputs, type trpc } from '../../trpc/trpc'
import { type SendResult, type UniboxData, type UniboxSource } from './source'
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

// The sentence for a reply that did not go, from brain's when it wrote one.
const failureOf = (state: 'FAILED' | 'UNKNOWN', failure: string | null | undefined) =>
   failure ??
   (state === 'UNKNOWN'
      ? 'LinkedIn did not show whether the reply was sent. Check the conversation on LinkedIn.'
      : 'LinkedIn did not send the reply.')

// A reply brain has: on its way (sending, or waiting its turn behind another reply of the account), or one that did not go. Its files are
// only names (the files themselves were never kept on this page), so sending it again needs them attached again.
const replyOf = (reply: NonNullable<WireConversation['reply']>): Pick<UniboxConversation, 'sending' | 'failed'> => {
   const attachments = reply.files.map(attachmentOf)

   if (reply.state === 'SENDING' || reply.state === 'QUEUED') {
      const since = Date.parse(reply.startedAt)

      return {
         sending: {
            text: reply.text,
            attachments,
            at: since,
            since,
            replyId: reply.id,
         },
      }
   }

   return {
      failed: {
         reason: failureOf(reply.state, reply.failure),
         text: reply.text,
         attachments,
         replyId: reply.id,
         ...(reply.state === 'UNKNOWN' && { unsure: true }),
      },
   }
}

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
      ...(conversation.reply && replyOf(conversation.reply)),
   }
}

const groups = (ids: string[]) =>
   Array.from({ length: Math.ceil(ids.length / MAX_IDS) }, (_, index) =>
      ids.slice(index * MAX_IDS, (index + 1) * MAX_IDS)
   )

// How a reply is followed: brain is asked every 2 seconds, for as long as it can have the reply in flight (brain ends one that is
// older than 15 minutes as unsure).
const POLL_MS = 2000
const POLL_TIMES = 460

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
// (.plan/unibox-send.md). `upload` posts a file of a reply to the bucket; without it files cannot be sent. `wait` is only for tests.
type Deps = {
   upload?: Upload
   wait?: (ms: number) => Promise<void>
}

export const createTrpcSource = (client: UniboxClient, { upload, wait = sleep }: Deps = {}): UniboxSource => {
   // Asks brain where a reply is until it ends: SENT, or a sentence for one that did not go.
   const follow = async (replyId: string): Promise<SendResult> => {
      for (let polls = 0; polls < POLL_TIMES; polls += 1) {
         await wait(POLL_MS)

         const reply = await client.unibox.reply.query({ id: replyId }).catch(() => undefined)

         if (reply?.state === 'SENT') {
            return { ok: true }
         }

         if (reply?.state === 'FAILED') {
            return {
               ok: false,
               reason: failureOf('FAILED', reply.failure),
            }
         }

         if (reply?.state === 'UNKNOWN') {
            return {
               ok: false,
               unsure: true,
               reason: failureOf('UNKNOWN', reply.failure),
            }
         }
      }

      return {
         ok: false,
         unsure: true,
         reason: 'No answer came in time. Check the conversation on LinkedIn.',
      }
   }

   return {
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

   send: async (_account, text, attachments, conversationId, events) => {
      // A link is only text on the page; there is nothing of it to upload.
      if (attachments.some(({ kind }) => kind === 'LINK')) {
         return {
            ok: false,
            reason: 'A link cannot be sent as an attachment. Put it in the words of the reply.',
         }
      }

      const uploadId = attachments.length > 0 ? crypto.randomUUID() : undefined
      // Progress is of all the files together, by their sizes.
      const total = attachments.reduce((sum, { file }) => sum + (file?.size ?? 0), 0)
      let done = 0

      for (const attachment of attachments) {
         const label = attachment.name ?? 'A file'

         if (!attachment.file || !upload) {
            return {
               ok: false,
               reason: `${label} is no longer here. Attach it again.`,
            }
         }

         const { size } = attachment.file
         const uploaded = await upload(uploadId ?? '', attachment.file, percent =>
            events?.progress?.(Math.round(((done + (size * percent) / 100) / total) * 100))
         )

         if (!uploaded.ok) {
            return {
               ok: false,
               reason: `${label}: ${uploaded.reason}`,
            }
         }

         done += size
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

      events?.started?.(started.id)

      return follow(started.id)
   },

   follow,

   dismissReply: async replyId => {
      await client.unibox.dismissReply.mutate({ id: replyId })
   },
   }
}
