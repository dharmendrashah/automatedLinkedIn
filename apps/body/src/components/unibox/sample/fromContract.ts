import { type Attachment, type Person, type UniboxAccount, type UniboxConversation, type UniboxMessage } from '../types'

// The shape of `messages.json`, which the spider writes (packages/contracts/src/messages.ts). It is described here because the web app
// does not depend on the contracts package, and read with checks because a file kept on a disk can be old or edited.
export type MessagesFileShape = {
   // The account the messages were read from, when the file names it.
   account?: Person
   conversations: Array<{
      id: string
      title: string
      kind: 'DIRECT' | 'GROUP'
      participants: Person[]
      unread: boolean
      complete: boolean
      messages: Array<{
         id: string
         sender: Person
         direction: 'ME' | 'THEM'
         date?: string
         time?: string
         when: string
         text: string
         attachments: Array<{ kind: string; name?: string }>
      }>
   }>
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isPerson = (value: unknown): value is Person => isObject(value) && typeof value.name === 'string'

const isMessage = (value: unknown): value is MessagesFileShape['conversations'][number]['messages'][number] =>
   isObject(value) &&
   typeof value.id === 'string' &&
   isPerson(value.sender) &&
   (value.direction === 'ME' || value.direction === 'THEM') &&
   typeof value.when === 'string' &&
   typeof value.text === 'string' &&
   Array.isArray(value.attachments)

export const parseMessagesFile = (raw: unknown): MessagesFileShape | undefined => {
   if (!isObject(raw) || !Array.isArray(raw.conversations)) {
      return undefined
   }

   const conversations: MessagesFileShape['conversations'] = []

   for (const item of raw.conversations as unknown[]) {
      if (
         isObject(item) &&
         typeof item.id === 'string' &&
         typeof item.title === 'string' &&
         (item.kind === 'DIRECT' || item.kind === 'GROUP') &&
         Array.isArray(item.participants) &&
         Array.isArray(item.messages)
      ) {
         conversations.push({
            id: item.id,
            title: item.title,
            kind: item.kind,
            participants: (item.participants as unknown[]).filter(isPerson),
            unread: item.unread === true,
            complete: item.complete !== false,
            messages: (item.messages as unknown[]).filter(isMessage),
         })
      }
   }

   return { ...(isPerson(raw.account) && { account: raw.account }), conversations }
}

const MINUTE = 60_000
const KNOWN: Attachment['kind'][] = ['IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'LINK']

const attachmentOf = ({ kind, name }: { kind: string; name?: string }): Attachment => ({
   kind: KNOWN.includes(kind as Attachment['kind']) ? (kind as Attachment['kind']) : 'FILE',
   ...(name && { name }),
})

// The time of each message, from the day and the time of day LinkedIn showed (in this machine's time zone). A message that showed
// none, as the later ones of a group do, is a minute after the one before.
const timesOf = (messages: MessagesFileShape['conversations'][number]['messages']) => {
   const times: number[] = []

   for (const message of messages) {
      const [year, month, day] = (message.date ?? '').split('-').map(Number)
      const [hour = 0, minute = 0] = (message.time ?? '').split(':').map(Number)
      const known = year && month && day ? new Date(year, month - 1, day, hour, minute).getTime() : undefined
      const before = times.at(-1)

      times.push(
         known === undefined || (message.time === undefined && before !== undefined)
            ? (before ?? 1_700_000_000_000) + MINUTE
            : known
      )
   }

   return times
}

// The account a file was read from: the one it names (with its picture) or, for a file that does not, the sender that writes most of its
// own messages. The page shows this one account, as the file says.
export const accountOfFile = (file: MessagesFileShape): UniboxAccount => {
   const counts = new Map<string, number>()

   for (const { messages } of file.conversations) {
      for (const { direction, sender } of messages) {
         if (direction === 'ME' && sender.name !== 'Me') {
            counts.set(sender.name, (counts.get(sender.name) ?? 0) + 1)
         }
      }
   }

   const [name = 'My account'] = [...counts].sort((a, b) => b[1] - a[1]).map(([sender]) => sender)

   return {
      id: 'file-account',
      name: file.account?.name ?? name,
      handle: 'messages.json',
      headline: 'The account these messages were read from',
      state: 'ACTIVE',
      ...(file.account?.imageUrl && { imageUrl: file.account.imageUrl }),
   }
}

// The conversations of a real file as the Unibox shows them: each once, with its own times and words, in the account that read them.
export const conversationsFromFile = (file: MessagesFileShape, account: UniboxAccount): UniboxConversation[] =>
   file.conversations.map((original): UniboxConversation => {
      const times = timesOf(original.messages)
      const messages: UniboxMessage[] = original.messages.map((message, at) => ({
         id: message.id,
         direction: message.direction,
         sender: message.sender.name,
         at: times[at] ?? 0,
         when: message.when,
         text: message.text,
         attachments: message.attachments.map(attachmentOf),
      }))
      const [first] = original.participants

      return {
         id: original.id,
         accountId: account.id,
         contact: first ?? { name: original.title },
         participants: original.participants,
         kind: original.kind,
         unread: original.unread,
         complete: original.complete,
         messages,
      }
   })
