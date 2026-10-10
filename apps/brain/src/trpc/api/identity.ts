import { TRPCError } from '@trpc/server'

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
      return await UserService.provisionAuthentikAccount({
         id: identity.id,
         name: identity.name,
         email: identity.email,
         emailVerified: identity.emailVerified,
      })
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
