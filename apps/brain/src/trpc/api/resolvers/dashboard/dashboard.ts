import { DashboardService } from 'database'

import { ownerProcedure, router } from 'trpc'

// The owner's first screen in one answer (.plan/dashboard-analytics.md). The platform owner also sees the wallet row.
const overview = ownerProcedure.query(({ ctx }) => DashboardService.overview(ctx.user.id, ctx.user.role === 'ADMIN'))

export const dashboard = router({ overview })
