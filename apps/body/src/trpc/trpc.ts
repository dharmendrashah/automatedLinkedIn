import { createTRPCReact } from '@trpc/react-query'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import type { AppRouter } from '../../../brain/src/trpc/api/router'

export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>

export const trpc = createTRPCReact<AppRouter>()
