import { z } from 'zod'

export const MESSAGES_CONTRACT_VERSION = 1

const personSchema = z.strictObject({
   name: z.string().min(1).max(300),
   profileUrl: z.string().max(500).optional(),
   // The address of the profile picture as the page showed it (LinkedIn's image host, https only); the picture is never downloaded.
   imageUrl: z
      .url({ protocol: /^https$/ })
      .max(1000)
      .optional(),
})

const attachmentSchema = z.strictObject({
   kind: z.enum(['IMAGE', 'FILE', 'LINK', 'OTHER']),
   // What the page shows as the name.
   name: z.string().max(300).optional(),
   // Where the spider kept the file in the bucket (`receivedKey`), with its size; absent when it was not downloaded. Brain keeps
   // a key only if it lies in the folder of the account's own owner.
   key: z.string().max(600).optional(),
   bytes: z.number().int().min(0).optional(),
})

export const messageSchema = z.strictObject({
   // LinkedIn's own id of the message (its `msg_message` urn), the same on every read.
   id: z.string().min(1).max(400),
   sender: personSchema,
   // ME: sent from the account. THEM: sent by someone else in the conversation.
   direction: z.enum(['ME', 'THEM']),
   // The day and the time of day LinkedIn showed, in the account's own time zone; left out when the page showed none or in a
   // form that was not understood. `when` is always the text as shown.
   date: z.iso.date().optional(),
   time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
   when: z.string().max(100),
   text: z.string().max(20_000),
   attachments: z.array(attachmentSchema).max(50),
})

export const conversationSchema = z.strictObject({
   // The id in the address of the conversation page (`/messaging/thread/<id>/`).
   id: z.string().min(1).max(300),
   title: z.string().max(300),
   kind: z.enum(['DIRECT', 'GROUP']),
   // The people other than the account that were seen in the conversation.
   participants: z.array(personSchema).max(100),
   // Whether it was unread in the list before it was opened.
   unread: z.boolean(),
   // The date text of its row in the list, as shown ("Jan 16").
   lastActivity: z.string().max(100),
   // Whether the first message of the conversation was reached; false when reading stopped before.
   complete: z.boolean(),
   messages: z.array(messageSchema),
})

// What a reading of the messages hands to the platform: one file per part, each small enough for a run to keep.
export const messagesFileSchema = z.strictObject({
   contract: z.literal(MESSAGES_CONTRACT_VERSION),
   part: z.number().int().min(1),
   captured_at: z.iso.datetime(),
   // The LinkedIn account the messages were read from, as the page showed it (its name and picture); left out when the page showed none.
   account: personSchema.optional(),
   conversations: z.array(conversationSchema),
})

export type Message = z.infer<typeof messageSchema>
export type Conversation = z.infer<typeof conversationSchema>
export type MessagesFile = z.infer<typeof messagesFileSchema>
