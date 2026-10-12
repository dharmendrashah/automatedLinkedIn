import { PrismaService } from './prisma.service'
import { TaskRefusedError } from './taskErrors'
import { type TaskHooks } from './taskHooks'

// Asking again right away would only repeat a login that LinkedIn may already be suspicious of.
const VERIFY_COOLDOWN_MS = 5 * 60 * 1000

// What the LinkedIn sign-in check changes in brain's own data: the account's status. The task itself is generic.
export const linkedInLoginHooks: TaskHooks = {
   async onRequest({ id, accountId, trigger }) {
      const account = await PrismaService.client.linkedInAccount.findUnique({
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

      await PrismaService.client.linkedInAccount.update({
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
   // repeated answer changes nothing) and must not have been paused meanwhile.
   async onResult(session, result) {
      const now = new Date()
      const verdict =
         result.verdict === 'VALID'
            ? {
                 status: 'ACTIVE' as const,
                 statusMessage: null,
                 lastVerifiedAt: now,
              }
            : {
                 status: ['ERROR', 'PROXY_FAILED', 'CRASHED', 'TIMED_OUT'].includes(result.verdict)
                    ? ('ERROR' as const)
                    : ('NEEDS_REAUTH' as const),
                 statusMessage: result.message,
              }

      await PrismaService.client.linkedInAccount.updateMany({
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
