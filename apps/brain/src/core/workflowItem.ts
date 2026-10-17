import { z } from 'zod'

// What flows between workflow steps and is saved per step. Only the minimal person fields are kept.

export type Signal = {
   type: 'commented' | 'reacted'
   // The post that surfaced the person.
   via: string
   at: string | null
   // A short piece of the comment, enough to judge interest.
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
}

export type PostItem = {
   kind: 'post'
   slug: string
   url: string
   postId: string
}

export type WorkflowItemData = PersonItem | PostItem

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
   type: z.enum(['commented', 'reacted']),
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
   }),
   z.object({
      kind: z.literal('post'),
      slug: z.string(),
      url: z.string(),
      postId: z.string(),
   }),
])

// Items come back from a JSON column; anything that does not fit is dropped rather than trusted.
export const readItem = (data: unknown): WorkflowItemData | null => itemSchema.safeParse(data).data ?? null

export const readSignals = (data: unknown): Signal[] => z.array(signalSchema).safeParse(data).data ?? []
