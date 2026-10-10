import { TRPCError, initTRPC } from '@trpc/server'

import { type Context } from './api/context'
import { provisionUser } from './api/identity'

const t = initTRPC.context<Context>().create()

export const { middleware, router } = t

// Requires a valid authentik access token and gives the caller a local user, linking or creating it on first use.
export const userProcedure = t.procedure.use(
   middleware(async ({ ctx, next }) => {
      if (!ctx.auth) {
         throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'A valid access token is required',
         })
      }

      const user = ctx.user ?? (await provisionUser(ctx.auth))

      return next({
         ctx: {
            ...ctx,
            auth: ctx.auth,
            user,
         },
      })
   })
)
