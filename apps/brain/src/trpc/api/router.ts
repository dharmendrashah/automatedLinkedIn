import { createExpressMiddleware } from '@trpc/server/adapters/express'
import type { Application } from 'express'

import { router } from 'trpc'

import { createContext } from './context'
import { linkedInAccount, me, proxyServer, session, status, task } from './resolvers'

export type AppRouter = typeof appRouter

export const appRouter = router({
   me,
   linkedInAccount,
   proxyServer,
   session,
   status,
   task,
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
