import type { CreateExpressContextOptions } from '@trpc/server/adapters/express'
import type { IncomingHttpHeaders } from 'http'

import { AuthService } from 'auth'

import { UserService } from 'database'

export const createContext = async ({ req, res }: CreateExpressContextOptions) => {
   // Request loses its http members through the stub `express-serve-static-core` package, so type the headers by hand.
   const { authorization } = (req as unknown as { headers: IncomingHttpHeaders }).headers

   const token = AuthService.bearerToken(authorization)

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
