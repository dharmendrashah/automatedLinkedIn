import { type LinkedInLink } from 'core'

import { LABEL_MAX } from '@automatedLinkedIn/contracts'

// Rules shared by the services that keep lists of pasted LinkedIn links (profiles, companies, posts). Each service
// passes in what is specific to its table: the fields to search and the three calls on its own Prisma delegate.

export type LabelMatch = 'any' | 'all'

export type RecordListQuery<S extends string = 'NEW' | 'CONTACTED' | 'REPLIED'> = {
   search?: string
   status?: S
   tags?: string[]
   tagMatch?: LabelMatch
   addedSince?: Date
   includeArchived?: boolean
   page: number
   pageSize: number
}

export const LABEL_LIMIT = LABEL_MAX

export const labelWhere = (labels: string[], match: LabelMatch = 'any', without: string[] = []) => ({
   ...(labels.length > 0 ? { tags: match === 'all' ? { hasEvery: labels } : { hasSome: labels } } : {}),
   ...(without.length > 0 ? { NOT: { tags: { hasSome: without } } } : {}),
})

export const recordWhere = <S extends string>(
   userId: string,
   query: RecordListQuery<S>,
   searchedFields: readonly string[]
) => ({
   userId,
   ...(query.includeArchived ? {} : { archivedAt: null }),
   ...(query.status ? { status: query.status } : {}),
   ...labelWhere(query.tags ?? [], query.tagMatch),
   ...(query.addedSince ? { createdAt: { gte: query.addedSince } } : {}),
   ...(query.search
      ? {
           OR: searchedFields.map(field => ({
              [field]: {
                 contains: query.search,
                 mode: 'insensitive' as const,
              },
           })),
        }
      : {}),
})

export const pageArgs = ({ page, pageSize }: Pick<RecordListQuery, 'page' | 'pageSize'>) => ({
   skip: (page - 1) * pageSize,
   take: pageSize,
})

// The slice of a list a workflow's input block takes. Empty statuses means every status.
export type InputFilter<S extends string = string> = {
   since: Date | null
   labels: string[]
   labelMatch: LabelMatch
   withoutLabels: string[]
   statuses: S[]
   order: 'newest' | 'oldest'
}

export const EVERYTHING: InputFilter<never> = {
   since: null,
   labels: [],
   labelMatch: 'any',
   withoutLabels: [],
   statuses: [],
   order: 'newest',
}

export const inputWhere = <S extends string>(userId: string, filter: InputFilter<S>) => ({
   userId,
   archivedAt: null,
   ...(filter.since ? { createdAt: { gte: filter.since } } : {}),
   ...(filter.statuses.length > 0 ? { status: { in: filter.statuses } } : {}),
   ...labelWhere(filter.labels, filter.labelMatch, filter.withoutLabels),
})

export const inputOrder = (order: InputFilter['order']) =>
   order === 'oldest'
      ? [{ createdAt: 'asc' as const }, { id: 'asc' as const }]
      : [{ createdAt: 'desc' as const }, { id: 'desc' as const }]

export type LabelChange = { add: string[]; remove: string[] }

// Removes first, then adds after the labels already there; `full` when some did not fit under the limit.
export const mergeLabels = (current: string[], { add, remove }: LabelChange) => {
   const kept = current.filter(label => !remove.includes(label))
   const added = [...new Set(add)].filter(label => !kept.includes(label))
   const labels = [...kept, ...added].slice(0, LABEL_LIMIT)

   return {
      labels,
      full: labels.length < kept.length + added.length,
   }
}

// Applies one change to many rows, writing only the rows it changes.
export const relabel = async (
   rows: { id: string; tags: string[] }[],
   change: LabelChange,
   write: (id: string, tags: string[]) => Promise<unknown>
) => {
   let changed = 0
   let full = 0

   for (const row of rows) {
      const { labels, full: over } = mergeLabels(row.tags, change)

      full += over ? 1 : 0

      if (labels.join('\n') !== row.tags.join('\n')) {
         await write(row.id, labels)
         changed += 1
      }
   }

   return {
      changed,
      full,
   }
}

const isNotFound = (error: unknown) => (error as { code?: string } | null)?.code === 'P2025'

// The id alone is not enough: every write names the owner, so a foreign id is the same as a missing one.
export const orNull = async <T>(write: Promise<T>) => {
   try {
      return await write
   } catch (error) {
      if (isNotFound(error)) {
         return null
      }

      throw error
   }
}

export type LinkStore<L extends LinkedInLink = LinkedInLink> = {
   existing: (slugs: string[]) => Promise<{ slug: string; archivedAt: Date | null }[]>
   restore: (slugs: string[]) => Promise<number>
   create: (links: L[]) => Promise<number>
}

// Saves each new link, restores archived ones and leaves live ones alone. Safe to repeat or to race: the store's
// create must skip rows that already exist.
export const addLinks = async <L extends LinkedInLink>(links: L[], store: LinkStore<L>) => {
   if (links.length === 0) {
      return {
         created: 0,
         restored: 0,
         skipped: 0,
      }
   }

   const existing = await store.existing(links.map(({ slug }) => slug))
   const known = new Set(existing.map(({ slug }) => slug))
   const archived = existing.filter(({ archivedAt }) => archivedAt).map(({ slug }) => slug)
   const fresh = links.filter(({ slug }) => !known.has(slug))

   const restored = archived.length > 0 ? await store.restore(archived) : 0
   const created = fresh.length > 0 ? await store.create(fresh) : 0

   return {
      created,
      restored,
      skipped: links.length - created - restored,
   }
}
