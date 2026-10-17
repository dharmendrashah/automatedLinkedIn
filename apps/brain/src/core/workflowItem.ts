import { z } from 'zod'

// What flows between workflow steps and is saved per step. Only the minimal person fields are kept.

export type Signal = {
   // commented and reacted carry the post; employee and hiring carry the company.
   type: 'commented' | 'reacted' | 'employee' | 'hiring'
   via: string
   at: string | null
   // A short piece of the comment, or the open roles of a hiring company.
   excerpt: string | null
}

export type Band = 'QUALIFIED' | 'MAYBE'

export type PersonItem = {
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
}

export type PostItem = {
   kind: 'post'
   slug: string
   url: string
   // The row in the owner's posts list; null for a post a workflow found by itself.
   postId: string | null
   // The author's profile link when the data service gave it; a block that wants people uses the author.
   author?: string | null
}

export type CompanyItem = {
   kind: 'company'
   slug: string
   url: string
   name: string | null
   // Open roles found for the company.
   hiring: string[]
}

export type WorkflowItemData = PersonItem | PostItem | CompanyItem

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

const signalSchema = z.object({
   type: z.enum(['commented', 'reacted', 'employee', 'hiring']),
   via: z.string(),
   at: nullableText,
   excerpt: nullableText,
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
   }),
   z.object({
      kind: z.literal('post'),
      slug: z.string(),
      url: z.string(),
      postId: z.string().nullable(),
      author: z.string().nullable().optional(),
   }),
   z.object({
      kind: z.literal('company'),
      slug: z.string(),
      url: z.string(),
      name: nullableText,
      hiring: z.array(z.string()),
   }),
])

// Items come back from a JSON column; anything that does not fit is dropped rather than trusted.
export const readItem = (data: unknown): WorkflowItemData | null => itemSchema.safeParse(data).data ?? null

export const readSignals = (data: unknown): Signal[] => z.array(signalSchema).safeParse(data).data ?? []
