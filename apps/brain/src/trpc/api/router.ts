import { createExpressMiddleware } from '@trpc/server/adapters/express'
import type { Application } from 'express'

import { router } from 'trpc'

import { onError } from '../onError'
import { createContext } from './context'
import {
   acceptRisk,
   accountProfile,
   browse,
   campaign,
   companyPage,
   connections,
   dashboard,
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
   positiveReply,
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
   campaign,
   companyPage,
   postPage,
   dashboard,
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
   positiveReply,
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
         onError,
      })
   )
}
