import { type TRPCError } from '@trpc/server'

import { log } from 'core/log'

// Errors tRPC wrapped itself (it sets `cause`) are logged here; resolvers that wrap their own errors already logged theirs.
export const onError = ({ error, path, type }: { error: TRPCError; path: string | undefined; type: string }) => {
   if (error.code === 'INTERNAL_SERVER_ERROR' && error.cause !== undefined) {
      log.error('Unhandled tRPC error', {
         path,
         type,
         error: error.cause,
      })
   }
}
