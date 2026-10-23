import { createExpressMiddleware } from '@trpc/server/adapters/express'
import type { Application } from 'express'

import { router } from 'trpc'

import { createContext } from './context'
import {
   companyPage,
   icp,
   label,
   linkedInAccount,
   linkedInCompany,
   linkedInPost,
   linkedInProfile,
   me,
   person,
   postPage,
   proxyServer,
   session,
   status,
   takeover,
   task,
   unibox,
   usage,
   workflow,
   workflowList,
} from './resolvers'

export type AppRouter = typeof appRouter

export const appRouter = router({
   me,
   companyPage,
   postPage,
   icp,
   label,
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
   unibox,
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
