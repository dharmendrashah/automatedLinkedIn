import type { CreateExpressContextOptions } from '@trpc/server/adapters/express'
import type { IncomingHttpHeaders } from 'http'

import { AuthService } from 'auth'

import { API_KEY_PREFIX, ApiKeyService, UserService } from 'database'

export const createContext = async ({ req, res }: CreateExpressContextOptions) => {
   // Request loses its http members through the stub `express-serve-static-core` package, so type the headers by hand.
   const { authorization } = (req as unknown as { headers: IncomingHttpHeaders }).headers

   const token = AuthService.bearerToken(authorization)

   // An API key authenticates straight to a local user; no authentik token exists for this request.
   if (token?.startsWith(API_KEY_PREFIX)) {
      const userId = await ApiKeyService.authenticate(token)
      const user = userId ? await UserService.findById(userId) : null

      return {
         req,
         res,
         auth: null,
         user,
      }
   }

   const auth = token ? await AuthService.authenticate(token) : null

   const user = auth ? await UserService.findByAuthentikId(auth.sub) : null

   return {
      req,
      res,
      auth,
      user,
   }
}

export type Context = Awaited<ReturnType<typeof createContext>>
