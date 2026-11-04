import { UserService } from 'database'

import { ownerProcedure } from 'trpc'

// The owner accepts, once, the notice shown before the first "Act for real". Calling it again keeps the first date.
export const acceptRisk = ownerProcedure.mutation(async ({ ctx }) => {
   const riskAcceptedAt = (await UserService.acceptRisk(ctx.user.id)) ?? null

   return { riskAcceptedAt }
})
