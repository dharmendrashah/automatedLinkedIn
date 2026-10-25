import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { PostFiles, UploadRefused } from 'core'

import { POST_FILES, POST_FILE_ID } from '@automatedLinkedIn/contracts'

import { ownerProcedure, router } from 'trpc'

const MOST = Math.max(...Object.values(POST_FILES).map(({ max }) => max))
const file = z.object({
   fileId: z.string().regex(POST_FILE_ID),
   name: z.string().min(1).max(300),
})

// A refusal brain wrote as a sentence for the owner (a type, a size, too many files) is a precondition that failed.
const orRefused = async <T>(work: Promise<T>) => {
   try {
      return await work
   } catch (error) {
      if (error instanceof UploadRefused) {
         throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: error.message,
         })
      }

      throw error
   }
}

// The files of the posts the owner is writing: a signed form to post one file straight to the bucket, the check that keeps it, and a
// ten minute link to read it (.plan/posting-file-uploads.md). Every call is scoped to ctx.user.id.
export const postFile = router({
   form: ownerProcedure
      .input(file.extend({ bytes: z.number().int().min(1).max(MOST) }))
      .mutation(({ ctx, input }) => orRefused(PostFiles.form(ctx.user.id, input.fileId, input.name, input.bytes))),

   confirm: ownerProcedure
      .input(file)
      .mutation(({ ctx, input }) => orRefused(PostFiles.confirm(ctx.user.id, input.fileId, input.name))),

   link: ownerProcedure
      .input(
         z.object({
            key: z.string().min(1).max(400),
            name: z.string().min(1).max(300),
         })
      )
      .query(async ({ ctx, input }) => ({ url: await orRefused(PostFiles.link(ctx.user.id, input.key, input.name)) })),
})
