import { type LinkedInLink } from 'core'

// Rules shared by the services that keep lists of pasted LinkedIn links (profiles, companies, posts). Each service
// passes in what is specific to its table: the fields to search and the three calls on its own Prisma delegate.

export type RecordListQuery<S extends string = 'NEW' | 'CONTACTED' | 'REPLIED'> = {
   search?: string
   status?: S
   tag?: string
   includeArchived?: boolean
   page: number
   pageSize: number
}

export const recordWhere = <S extends string>(
   userId: string,
   query: RecordListQuery<S>,
   searchedFields: readonly string[]
) => ({
   userId,
   ...(query.includeArchived ? {} : { archivedAt: null }),
   ...(query.status ? { status: query.status } : {}),
   ...(query.tag ? { tags: { has: query.tag } } : {}),
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

export type LinkStore = {
   existing: (slugs: string[]) => Promise<{ slug: string; archivedAt: Date | null }[]>
   restore: (slugs: string[]) => Promise<number>
   create: (links: LinkedInLink[]) => Promise<number>
}

// Saves each new link, restores archived ones and leaves live ones alone. Safe to repeat or to race: the store's
// create must skip rows that already exist.
export const addLinks = async (links: LinkedInLink[], store: LinkStore) => {
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
