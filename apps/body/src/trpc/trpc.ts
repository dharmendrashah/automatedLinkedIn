import { createTRPCReact } from '@trpc/react-query'

import { type AppRouter } from '../../../brain/src/trpc/api/router'

export const trpc = createTRPCReact<AppRouter>()