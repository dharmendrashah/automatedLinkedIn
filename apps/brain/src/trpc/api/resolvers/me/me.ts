import { userProcedure } from 'trpc'

import { identityOfUser, loadIdentity } from '../../identity'
import { present } from '../owned'

export const me = userProcedure.query(async ({ ctx }) => ({
   identity: ctx.auth ? await loadIdentity(ctx.auth) : identityOfUser(present(ctx.user, 'No session to read')),
   user: ctx.user && {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role,
      riskAcceptedAt: ctx.user.riskAcceptedAt,
   },
}))
