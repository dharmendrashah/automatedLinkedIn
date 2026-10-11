import { createTRPCReact } from '@trpc/react-query'
import type { inferRouterOutputs } from '@trpc/server'

import type { AppRouter } from '../../../brain/src/trpc/api/router'

export type RouterOutputs = inferRouterOutputs<AppRouter>

export const trpc = createTRPCReact<AppRouter>()
