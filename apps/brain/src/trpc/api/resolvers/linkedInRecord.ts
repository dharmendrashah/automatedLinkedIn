import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { type LinkKind, TooManyLinksError, parseLinkedInUrls } from 'core'

// Input pieces and answers shared by the routers that keep lists of pasted LinkedIn links (profiles, companies).

export const byId = z.object({ id: z.string().min(1) })
export const status = z.enum(['NEW', 'CONTACTED', 'REPLIED'])

// Optional text; an empty value clears the field.
export const text = (max: number) =>
   z
      .string()
      .trim()
      .max(max)
      .transform(value => value || null)

export const tag = z.string().trim().toLowerCase().min(1).max(30)
export const tags = z
   .array(tag)
   .max(10)
   .transform(values => [...new Set(values)])

export const createInput = z.object({ urls: z.string().trim().min(1).max(50_000) })

export const listInput = z.object({
   search: z.string().trim().max(100).optional(),
   status: status.optional(),
   tag: tag.optional(),
   includeArchived: z.boolean().optional(),
   page: z.number().int().min(1).default(1),
   pageSize: z.number().int().min(1).max(100).default(25),
})

// An id that is not the caller's is answered exactly like a missing one.
export const found = <T>(row: T | null, noun: string) => {
   if (!row) {
      throw new TRPCError({
         code: 'NOT_FOUND',
         message: `LinkedIn ${noun} not found`,
      })
   }

   return row
}

export const readLinks = (urls: string, kind: LinkKind) => {
   try {
      return parseLinkedInUrls(urls, kind)
   } catch (error) {
      if (error instanceof TooManyLinksError) {
         throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
         })
      }

      throw error
   }
}
