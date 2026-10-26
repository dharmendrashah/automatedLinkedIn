import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

// Asking again right away would only repeat a login that LinkedIn may already be suspicious of.
const VERIFY_COOLDOWN_MS = 5 * 60 * 1000

// A failed check is an error of the system, a restriction by LinkedIn, or something the owner has to fix. Verdicts of a check
// that never ran (it could not be queued, or the task is gone) are errors of the system, never a reason to change credentials.
const statusOf = (verdict: string) => {
   if (verdict === 'BLOCKED') {
      return 'BLOCKED' as const
   }

   return ['ERROR', 'PROXY_FAILED', 'CRASHED', 'TIMED_OUT', 'NOT_QUEUED', 'NOT_STARTED', 'UNKNOWN_TASK'].includes(
      verdict
   )
      ? ('ERROR' as const)
      : ('NEEDS_REAUTH' as const)
}

// What the LinkedIn sign-in check changes in brain's own data: the account's status. The task itself is generic.
export const linkedInLoginHooks: TaskHooks = {
   async onRequest({ id, accountId, trigger }, tx) {
      const account = await tx.linkedInAccount.findUnique({
         where: { id: accountId },
         select: {
            status: true,
            validationRequestedAt: true,
         },
      })

      if (!account || account.status === 'DISABLED') {
         throw new TaskRefusedError('Resume the account before verifying it.')
      }

      const asked = trigger !== 'automatic'

      if (asked && account.validationRequestedAt) {
         const waitMs = account.validationRequestedAt.getTime() + VERIFY_COOLDOWN_MS - Date.now()

         if (waitMs > 0) {
            throw new TaskRefusedError(
               `This account was checked a moment ago. Try again in ${Math.ceil(waitMs / 60_000)} minute(s).`
            )
         }
      }

      const now = new Date()

      await tx.linkedInAccount.update({
         where: { id: accountId },
         data: {
            validationId: id,
            validationRequestedAt: now,
            ...(asked && {
               status: 'PENDING' as const,
               statusMessage: null,
               statusUpdatedAt: now,
            }),
         },
      })
   },

   // One conditional update does the whole check: the account must still be waiting for this very sign-in (so an old or
   // repeated answer changes nothing) and must not have been paused meanwhile. A check cancelled because the owner paused
   // the account only lets go of it; one that needed a proxy puts the account back to waiting for one.
   async onResult(session, result, tx) {
      const now = new Date()

      if (result.verdict === 'CANCELLED') {
         await tx.linkedInAccount.updateMany({
            where: {
               id: session.linkedInAccountId,
               validationId: session.id,
            },
            data: { validationId: null },
         })

         return
      }

      const verdict =
         result.verdict === 'VALID'
            ? {
                 status: 'ACTIVE' as const,
                 statusMessage: null,
                 lastVerifiedAt: now,
              }
            : {
                 status: result.verdict === 'NEEDS_PROXY' ? ('PENDING' as const) : statusOf(result.verdict),
                 statusMessage: result.message,
              }

      await tx.linkedInAccount.updateMany({
         where: {
            id: session.linkedInAccountId,
            validationId: session.id,
            status: { not: 'DISABLED' },
         },
         data: {
            ...verdict,
            statusUpdatedAt: now,
            validationId: null,
         },
      })
   },
}
