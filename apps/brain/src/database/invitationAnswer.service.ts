import { INVITATION_LIMITS } from '@automatedLinkedIn/contracts'

import { LinkedInInvitationService } from './linkedInInvitation.service'
import { PrismaService } from './prisma.service'

// What the "Answer connection requests" block asks and reads back (.plan/account-action-blocks.md): the requests waiting for the
// owner in the chosen accounts, answered by `linkedin-invitations` runs of at most `perRun`. The domain service keeps every rule.

export type AnswerAction = 'ACCEPT' | 'IGNORE'

export type Standing = { status: 'WAITING' | 'DONE' | 'FAILED' | 'UNSURE'; reason: string | null }

export class InvitationAnswerService {
   public static readonly PER_RUN = INVITATION_LIMITS.perRun

   // The requests of these people that still wait in these accounts.
   public static pending(userId: string, accountIds: string[], slugs: string[]) {
      return PrismaService.client.linkedInInvitation.findMany({
         where: {
            userId,
            accountId: { in: accountIds },
            slug: { in: slugs },
            status: 'PENDING',
         },
         orderBy: [{ position: 'asc' }, { id: 'asc' }],
         select: {
            id: true,
            slug: true,
            accountId: true,
         },
      })
   }

   // Asks one account's run to answer these requests. Throws the refusal (the day's limit, an account that is busy or signed out).
   public static async answer(userId: string, accountId: string, ids: string[], action: AnswerAction) {
      const asked = await LinkedInInvitationService.answer(
         userId,
         accountId,
         ids.map(id => ({
            id,
            action,
         }))
      )

      return asked !== null
   }

   // Where each asked request stands now, by its id.
   public static async standing(userId: string, ids: string[]) {
      const rows = await PrismaService.client.linkedInInvitation.findMany({
         where: {
            userId,
            id: { in: ids },
         },
         select: {
            id: true,
            status: true,
            failure: true,
         },
      })

      return new Map(
         rows.map(row => [
            row.id,
            (row.status === 'ACCEPTED' || row.status === 'IGNORED'
               ? {
                    status: 'DONE',
                    reason: null,
                 }
               : row.status === 'UNKNOWN'
                 ? {
                      status: 'UNSURE',
                      reason: row.failure,
                   }
                 : row.status === 'FAILED' || row.status === 'GONE'
                   ? {
                        status: 'FAILED',
                        reason: row.failure,
                     }
                   : {
                        status: 'WAITING',
                        reason: null,
                     }) satisfies Standing,
         ])
      )
   }
}
