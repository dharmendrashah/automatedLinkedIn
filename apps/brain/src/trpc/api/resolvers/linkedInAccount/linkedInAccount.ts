import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { extractLiAt, parseTotpSecret } from 'core'

import { LinkedInAccountConflictError, LinkedInAccountService, LinkedInCredentialsError } from 'database'

import { router, userProcedure } from 'trpc'

const secret = z.string().min(1).max(8192)
const email = z.string().min(1).max(320)
const byId = z.object({ id: z.string().min(1) })

// Runs a parser as input validation so its plain-language message reaches the user as BAD_REQUEST.
const parsedWith = (parse: (value: string) => string, max: number) =>
   z
      .string()
      .min(1)
      .max(max)
      .transform((value, ctx) => {
         try {
            return parse(value)
         } catch (error) {
            ctx.addIssue({
               code: 'custom',
               message: (error as Error).message,
            })

            return z.NEVER
         }
      })

// An otpauth:// URI or a bare base32 secret; only the canonical base32 secret is kept.
const totpSecret = parsedWith(parseTotpSecret, 8192)

// A whole cookie dump or just li_at. It must contain a usable li_at; the pasted text is what is stored.
const sessionCookie = parsedWith(value => {
   extractLiAt(value)

   return value.trim()
}, 65536)

const createInput = z.object({
   email,
   password: secret.optional(),
   totpSecret: totpSecret.optional(),
   session: sessionCookie.optional(),
})

const updateInput = z.object({
   id: z.string().min(1),
   email: email.optional(),
   password: secret.nullish(),
   totpSecret: totpSecret.nullish(),
   session: sessionCookie.nullish(),
})

const asTrpcError = (error: unknown) => {
   if (error instanceof LinkedInAccountConflictError) {
      return new TRPCError({
         code: 'CONFLICT',
         message: error.message,
      })
   }

   if (error instanceof LinkedInCredentialsError) {
      return new TRPCError({
         code: 'BAD_REQUEST',
         message: error.message,
      })
   }

   return error
}

const notFound = () =>
   new TRPCError({
      code: 'NOT_FOUND',
      message: 'LinkedIn account not found',
   })

// Narrows ctx.user to non-null: userProcedure may leave it null for an identity without a local row.
const ownerProcedure = userProcedure.use(({ ctx, next }) => {
   if (!ctx.user) {
      throw new TRPCError({
         code: 'FORBIDDEN',
         message: 'No account is linked to this login yet',
      })
   }

   return next({
      ctx: {
         ...ctx,
         user: ctx.user,
      },
   })
})

// Every procedure scopes to ctx.user.id, so one user can never reach another's accounts by id.
// Only `reveal` returns decrypted secrets; it is a mutation so the secret is never cached by react-query.
export const linkedInAccount = router({
   create: ownerProcedure.input(createInput).mutation(async ({ ctx, input }) => {
      try {
         return await LinkedInAccountService.create(ctx.user.id, input.email, {
            password: input.password,
            totpSecret: input.totpSecret,
            session: input.session,
         })
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   list: ownerProcedure.query(({ ctx }) => LinkedInAccountService.listForUser(ctx.user.id)),

   get: ownerProcedure.input(byId).query(({ ctx, input }) => LinkedInAccountService.getForUser(ctx.user.id, input.id)),

   reveal: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      const found = await LinkedInAccountService.revealForUser(ctx.user.id, input.id)

      if (!found) {
         throw notFound()
      }

      return found
   }),

   update: ownerProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
      try {
         const updated = await LinkedInAccountService.updateForUser(ctx.user.id, input.id, {
            email: input.email,
            secrets: {
               password: input.password,
               totpSecret: input.totpSecret,
               session: input.session,
            },
         })

         if (!updated) {
            throw notFound()
         }

         return updated
      } catch (error) {
         throw asTrpcError(error)
      }
   }),

   setPaused: ownerProcedure
      .input(
         z.object({
            id: z.string().min(1),
            paused: z.boolean(),
         })
      )
      .mutation(async ({ ctx, input }) => {
         const account = await LinkedInAccountService.setPausedForUser(ctx.user.id, input.id, input.paused)

         if (!account) {
            throw notFound()
         }

         return account
      }),

   delete: ownerProcedure.input(byId).mutation(async ({ ctx, input }) => {
      const deleted = await LinkedInAccountService.deleteForUser(ctx.user.id, input.id)

      return { deleted }
   }),
})
