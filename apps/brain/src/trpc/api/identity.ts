import { TRPCError } from '@trpc/server'

import { ADMIN_EMAIL } from 'env'

import { AuthService, type AuthenticatedRequest } from 'auth'

import { AccountConflictError, UserService } from 'database'

export const loadIdentity = (auth: AuthenticatedRequest) =>
   AuthService.fetchIdentity(auth).catch(() => {
      throw new TRPCError({
         code: 'BAD_GATEWAY',
         message: 'Could not load the profile from the identity provider',
      })
   })

// Finds, links or creates the local user for a caller who has none yet.
export const provisionUser = async (auth: AuthenticatedRequest) => {
   const identity = await loadIdentity(auth)

   try {
      const user = await UserService.provisionAuthentikAccount({
         id: identity.id,
         name: identity.name,
         email: identity.email,
         emailVerified: identity.emailVerified,
      })

      // The platform owner becomes ADMIN, only on a verified email.
      if (user && identity.emailVerified && UserService.isAdminEmail(user.email, ADMIN_EMAIL)) {
         await UserService.syncAdmin(ADMIN_EMAIL)

         return await UserService.findById(user.id)
      }

      return user
   } catch (error) {
      if (error instanceof AccountConflictError) {
         throw new TRPCError({
            code: 'CONFLICT',
            message: error.message,
         })
      }

      throw error
   }
}
