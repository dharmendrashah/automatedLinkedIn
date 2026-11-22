import { DashboardService } from 'database'

import { ownerProcedure, router } from 'trpc'

const overview = ownerProcedure.query(({ ctx }) => DashboardService.overview(ctx.user.id, ctx.user.role === 'ADMIN'))

// One summary call for the owner's home screen (recent activity and key numbers across accounts and campaigns). An
// account with the admin role also receives the platform's wallet balance in the same response.
export const dashboard = router({ overview })
