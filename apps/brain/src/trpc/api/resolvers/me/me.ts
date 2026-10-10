import { userProcedure } from 'trpc'

import { loadIdentity } from '../../identity'

export const me = userProcedure.query(async ({ ctx }) => ({
   identity: await loadIdentity(ctx.auth),
   user: ctx.user && {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role,
   },
}))
