import { z } from 'zod'

import { type CompanySnapshotData, type PostSnapshotData, companySchema, postSchema } from './pageSnapshot'

// What flows between workflow steps and is saved per step. Only the minimal person fields are kept.

export type Signal = {
   // commented and reacted carry the post; employee and hiring carry the company.
   type: 'commented' | 'reacted' | 'employee' | 'hiring'
   via: string
   at: string | null
   // A short piece of the comment, or the open roles of a hiring company.
   excerpt: string | null
   // The post as the run read it, shown here instead of sending the owner to LinkedIn. Older signals have none.
   post?: PostSnapshotData | null
}

export type Band = 'QUALIFIED' | 'MAYBE'

// What an Account Actions block did with an item, readable by the blocks after it (.plan/account-action-blocks.md). `status` is
// a fixed word such as SENT, QUEUED, VISITED, SKIPPED, NOT_AVAILABLE, FAILED or UNKNOWN; `reason` is one fixed sentence.
export type ItemResult = {
   action: string
   status: string
   account: string | null
   at: string | null
   reason: string | null
}

// What an event or a block says about one item, by `scope.key` (for example `item.noteSent`): read by "If the event says".
export type ItemFacts = Record<string, string | number | boolean | null>

type WithResult = { result?: ItemResult | null; facts?: ItemFacts }

// Where the stored chat with a person is (Get our chat with them): pointers and counts, never message text. `stored` is null when no
// account in scope had read its messages.
export type ChatPointer = {
   stored: boolean | null
   complete: boolean
   accountIds: string[]
   conversationIds: string[]
   messages: number
   weWrote: boolean
   theyWrote: boolean
   lastFrom: 'ME' | 'THEM' | null
}

export type PersonItem = WithResult & {
   kind: 'profile'
   slug: string
   url: string
   name: string | null
   headline: string | null
   location: string | null
   followers: number | null
   title: string | null
   company: string | null
   signals: Signal[]
   score: number | null
   band: Band | null
   matched: string[]
   enriched: boolean
   // Came from the owner's own /profiles, so the Seen set lets the person through.
   known: boolean
   tags: string[]
   // A work email found for the person.
   email?: string | null
   // The day they connected to one of the owner's accounts, when an account was read for it.
   connectedOn?: string | null
   // What the person wrote with a connection request to the owner, shortened.
   note?: string | null
   // What the company of the current job says, when Get full profile read it: its industry, its size band and its website's domain.
   companyIndustry?: string | null
   companySize?: string | null
   companyDomain?: string | null
   // The stored chat with them, found by Get our chat with them.
   chat?: ChatPointer
}

export type PostItem = WithResult & {
   kind: 'post'
   slug: string
   url: string
   // The row in the owner's posts list; null for a post a workflow found by itself.
   postId: string | null
   // The author's profile link when the data service gave it; a block that wants people uses the author.
   author?: string | null
   // The person whose posts were asked for (Get posts of people): their slug and the score they had, so a block after it can
   // pick the best authors first.
   authorSlug?: string | null
   authorScore?: number | null
   // The post as the data service returned it, when a block found it.
   preview?: PostSnapshotData | null
   // The words Write words put on the post, or the owner approved, and how they were written.
   written?: string | null
   writtenMode?: 'TEXTS' | 'AI' | null
}

export type CompanyItem = WithResult & {
   kind: 'company'
   slug: string
   url: string
   name: string | null
   // Open roles found for the company.
   hiring: string[]
   // The company page as the run read it, when a block found it.
   preview?: CompanySnapshotData | null
}

// A job posting a search found; it belongs to a company when LinkedIn names one.
export type JobItem = WithResult & {
   kind: 'job'
   // LinkedIn's job id.
   slug: string
   url: string
   title: string | null
   company: string | null
   companySlug: string | null
   location: string | null
   posted: string | null
   workplace: string | null
   employment: string | null
   applicants: number | null
   salary: string | null
}

// An ad a company runs; kept in the run only.
export type AdItem = WithResult & {
   kind: 'ad'
   slug: string
   url: string
   advertiser: string | null
   headline: string | null
   body: string | null
   format: string | null
   started: string | null
   ended: string | null
   clickUrl: string | null
}

// A conversation of one of the owner's accounts: the other person and the last message, shortened. No attachments.
export const CONVERSATION_EXCERPT = 200

export type ConversationItem = WithResult & {
   kind: 'conversation'
   // The conversation's id, as in the address of its page.
   slug: string
   url: string
   personSlug: string | null
   name: string | null
   headline: string | null
   lastText: string | null
   lastAt: string | null
   lastFrom: 'ME' | 'THEM' | null
   unread: boolean
}

export type WorkflowItemData = PersonItem | PostItem | CompanyItem | JobItem | AdItem | ConversationItem

export const EXCERPT_LENGTH = 140

export const person = (fields: Pick<PersonItem, 'slug' | 'url'> & Partial<PersonItem>): PersonItem => ({
   kind: 'profile',
   name: null,
   headline: null,
   location: null,
   followers: null,
   title: null,
   company: null,
   signals: [],
   score: null,
   band: null,
   matched: [],
   enriched: false,
   known: false,
   tags: [],
   ...fields,
})

const sameSignal = (a: Signal, b: Signal) => a.type === b.type && a.via === b.via

// One person reached twice (two posts, a comment and a reaction): known fields win and the signals add up.
export const mergePeople = (a: PersonItem, b: PersonItem): PersonItem => ({
   ...a,
   name: a.name ?? b.name,
   headline: a.headline ?? b.headline,
   location: a.location ?? b.location,
   followers: a.followers ?? b.followers,
   title: a.title ?? b.title,
   company: a.company ?? b.company,
   email: a.email ?? b.email,
   connectedOn: a.connectedOn ?? b.connectedOn,
   note: a.note ?? b.note,
   companyIndustry: a.companyIndustry ?? b.companyIndustry,
   companySize: a.companySize ?? b.companySize,
   companyDomain: a.companyDomain ?? b.companyDomain,
   chat: a.chat ?? b.chat,
   known: a.known || b.known,
   tags: [...new Set([...a.tags, ...b.tags])],
   signals: [...a.signals, ...b.signals.filter(signal => !a.signals.some(known => sameSignal(known, signal)))],
})

export const mergeBySlug = (people: PersonItem[]) => {
   const bySlug = new Map<string, PersonItem>()

   for (const item of people) {
      const known = bySlug.get(item.slug)

      bySlug.set(item.slug, known ? mergePeople(known, item) : item)
   }

   return [...bySlug.values()]
}

const nullableText = z.string().nullable()

const resultSchema = z
   .object({
      action: z.string(),
      status: z.string(),
      account: nullableText,
      at: nullableText,
      reason: nullableText,
   })
   .nullable()
   .optional()

const factsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()

const chatSchema = z.object({
   stored: z.boolean().nullable(),
   complete: z.boolean(),
   accountIds: z.array(z.string()),
   conversationIds: z.array(z.string()),
   messages: z.number(),
   weWrote: z.boolean(),
   theyWrote: z.boolean(),
   lastFrom: z.enum(['ME', 'THEM']).nullable(),
})

const signalSchema = z.object({
   type: z.enum(['commented', 'reacted', 'employee', 'hiring']),
   via: z.string(),
   at: nullableText,
   excerpt: nullableText,
   post: postSchema.nullable().optional(),
})

const itemSchema = z.discriminatedUnion('kind', [
   z.object({
      kind: z.literal('profile'),
      slug: z.string(),
      url: z.string(),
      name: nullableText,
      headline: nullableText,
      location: nullableText,
      followers: z.number().nullable(),
      title: nullableText,
      company: nullableText,
      signals: z.array(signalSchema),
      score: z.number().nullable(),
      band: z.enum(['QUALIFIED', 'MAYBE']).nullable(),
      matched: z.array(z.string()),
      enriched: z.boolean(),
      // Items saved before Phase 3 have neither.
      known: z.boolean().default(false),
      tags: z.array(z.string()).default([]),
      email: nullableText.optional(),
      connectedOn: nullableText.optional(),
      note: nullableText.optional(),
      companyIndustry: nullableText.optional(),
      companySize: nullableText.optional(),
      companyDomain: nullableText.optional(),
      chat: chatSchema.optional(),
      result: resultSchema,
      facts: factsSchema,
   }),
   z.object({
      kind: z.literal('post'),
      slug: z.string(),
      url: z.string(),
      postId: z.string().nullable(),
      author: z.string().nullable().optional(),
      authorSlug: z.string().nullable().optional(),
      authorScore: z.number().nullable().optional(),
      preview: postSchema.nullable().optional(),
      written: z.string().nullable().optional(),
      writtenMode: z.enum(['TEXTS', 'AI']).nullable().optional(),
      result: resultSchema,
      facts: factsSchema,
   }),
   z.object({
      kind: z.literal('company'),
      slug: z.string(),
      url: z.string(),
      name: nullableText,
      hiring: z.array(z.string()),
      preview: companySchema.nullable().optional(),
      result: resultSchema,
      facts: factsSchema,
   }),
   z.object({
      kind: z.literal('job'),
      slug: z.string(),
      url: z.string(),
      title: nullableText,
      company: nullableText,
      companySlug: nullableText,
      location: nullableText,
      posted: nullableText,
      workplace: nullableText,
      employment: nullableText,
      applicants: z.number().nullable(),
      salary: nullableText,
      result: resultSchema,
      facts: factsSchema,
   }),
   z.object({
      kind: z.literal('ad'),
      slug: z.string(),
      url: z.string(),
      advertiser: nullableText,
      headline: nullableText,
      body: nullableText,
      format: nullableText,
      started: nullableText,
      ended: nullableText,
      clickUrl: nullableText,
      result: resultSchema,
      facts: factsSchema,
   }),
   z.object({
      kind: z.literal('conversation'),
      slug: z.string(),
      url: z.string(),
      personSlug: nullableText,
      name: nullableText,
      headline: nullableText,
      lastText: nullableText,
      lastAt: nullableText,
      lastFrom: z.enum(['ME', 'THEM']).nullable(),
      unread: z.boolean(),
      result: resultSchema,
      facts: factsSchema,
   }),
])

// Items come back from a JSON column; anything that does not fit is dropped rather than trusted.
export const readItem = (data: unknown): WorkflowItemData | null => itemSchema.safeParse(data).data ?? null

export const readSignals = (data: unknown): Signal[] => z.array(signalSchema).safeParse(data).data ?? []

// For table pages: the post body is only shown in the drawer.
export const briefSignals = (data: unknown) => readSignals(data).map(({ post: _post, ...signal }) => signal)
