import { createExpressMiddleware } from '@trpc/server/adapters/express'
import type { Application } from 'express'

import { router } from 'trpc'

import { createContext } from './context'
import {
   icp,
   linkedInAccount,
   linkedInCompany,
   linkedInPost,
   linkedInProfile,
   me,
   person,
   proxyServer,
   session,
   status,
   takeover,
   task,
   usage,
   workflow,
   workflowList,
} from './resolvers'

export type AppRouter = typeof appRouter

export const appRouter = router({
   me,
   icp,
   linkedInAccount,
   linkedInCompany,
   linkedInPost,
   linkedInProfile,
   person,
   proxyServer,
   session,
   status,
   takeover,
   task,
   usage,
   workflow,
   workflowList,
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
