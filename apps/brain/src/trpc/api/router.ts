import { createExpressMiddleware } from '@trpc/server/adapters/express'
import type { Application } from 'express'

import { router } from 'trpc'

import { createContext } from './context'
import {
   acceptRisk,
   accountProfile,
   browse,
   companyPage,
   connections,
   draft,
   icp,
   jobs,
   label,
   linkedInAccount,
   linkedInCompany,
   linkedInPost,
   linkedInProfile,
   me,
   network,
   people,
   person,
   postDraft,
   postFile,
   postPage,
   postPublication,
   proxyServer,
   session,
   status,
   takeover,
   task,
   unibox,
   usage,
   voice,
   workflow,
   workflowList,
} from './resolvers'

export type AppRouter = typeof appRouter

export const appRouter = router({
   me,
   acceptRisk,
   network,
   connections,
   accountProfile,
   browse,
   companyPage,
   postPage,
   draft,
   icp,
   jobs,
   label,
   linkedInAccount,
   linkedInCompany,
   linkedInPost,
   linkedInProfile,
   person,
   people,
   postDraft,
   postFile,
   postPublication,
   proxyServer,
   session,
   status,
   takeover,
   task,
   unibox,
   usage,
   voice,
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
