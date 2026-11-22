import { TRPCError, initTRPC } from '@trpc/server'

import { type Context } from './api/context'
import { provisionUser } from './api/identity'
import { errorShape } from './errorShape'

const t = initTRPC.context<Context>().create({ errorFormatter: errorShape })

export const { middleware, router } = t

// Requires a valid authentik access token or API key, and gives the caller a local user: linking or creating one on
// first use for an authentik login, or the key's already-existing owner for an API key (an API key can only ever
// belong to an existing account, so there is nothing to provision).
export const userProcedure = t.procedure.use(
   middleware(async ({ ctx, next }) => {
      if (!ctx.auth && !ctx.user) {
         throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'A valid access token or API key is required',
         })
      }

      const user = ctx.user ?? (ctx.auth ? await provisionUser(ctx.auth) : null)

      return next({
         ctx: {
            ...ctx,
            auth: ctx.auth,
            user,
         },
      })
   })
)

// Narrows ctx.user to non-null: userProcedure may leave it null for an identity without a local row.
export const ownerProcedure = userProcedure.use(({ ctx, next }) => {
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

// The platform owner: the shared wallet and every client's spend.
export const adminProcedure = ownerProcedure.use(({ ctx, next }) => {
   if (ctx.user.role !== 'ADMIN') {
      throw new TRPCError({
         code: 'FORBIDDEN',
         message: 'Only the platform owner can see this',
      })
   }

   return next()
})
