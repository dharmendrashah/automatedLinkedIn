import { createExpressMiddleware } from '@trpc/server/adapters/express'
import type { Application } from 'express'

import { router } from 'trpc'

import { createContext } from './context'
import { getRole, linkedInAccount, me, proxyServer } from './resolvers'

export type AppRouter = typeof appRouter

export const appRouter = router({
   getRole,
   me,
   linkedInAccount,
   proxyServer,
})

export const initializeTrpc = async (app: Application) => {
   app.use(
      '/trpc',
      createExpressMiddleware({
         router: appRouter,
         createContext,
      })
   )
}
