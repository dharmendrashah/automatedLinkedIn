import { type SpiderSessionKind, type SpiderSessionStatus } from 'generated/prisma/client'

import { SECURITY_CHECK_MESSAGE } from '@automatedLinkedIn/contracts'

type Retryable = {
   kind: SpiderSessionKind
   status: SpiderSessionStatus
   outcome: string | null
   message: string | null
}

// Why a session cannot be tried again through another proxy, or undefined when it can. Only a failure a different
// address can plausibly fix is retried: an error, or a security check. A rejected password or code, or a missing
// credential, needs the owner to change the credentials, and repeating a sign-in is how accounts get locked.
export const retryRefusal = ({ kind, status, outcome, message }: Retryable) => {
   if (kind !== 'VALIDATE_ACCOUNT') {
      return 'This kind of session cannot be tried again yet.'
   }

   if (status === 'IN_PROGRESS') {
      return 'Wait for this session to finish.'
   }

   if (status === 'SUCCEEDED') {
      return 'This session succeeded, so there is nothing to fix.'
   }

   if (outcome === 'ERROR' || (outcome === 'NEEDS_REAUTH' && message === SECURITY_CHECK_MESSAGE)) {
      return undefined
   }

   return "A different proxy will not fix this. Update the account's credentials on the LinkedIn accounts page."
}
