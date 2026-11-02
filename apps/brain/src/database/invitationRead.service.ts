import { INVITATIONS_TASK } from './linkedInInvitation.hooks'
import { LinkedInInvitationService } from './linkedInInvitation.service'
import { profileUrlOf } from './personContacts'
import { PrismaService } from './prisma.service'
import { type ReadState, readStateOf } from './readState'
import { TaskRefusedError } from './taskErrors'

// What the "Get my connection requests" block asks and reads (.plan/account-action-blocks.md): the requests the account received
// and has not answered, from its `linkedin-invitations` read.

// The most characters of a request's note the block gives.
const NOTE_MAX = 300

export class InvitationReadService {
   // Asks the account's read; one that is being read already counts as asked. Throws the sentence when it cannot be asked.
   public static async ask(userId: string, accountId: string) {
      const refresh = await LinkedInInvitationService.refresh(userId, [accountId])

      if (refresh === null) {
         return false
      }

      const [skipped] = refresh.skipped

      if (skipped) {
         throw new TaskRefusedError(skipped.reason)
      }

      return true
   }

   public static state(accountId: string, since: Date): Promise<ReadState> {
      return readStateOf(accountId, INVITATIONS_TASK, since)
   }

   // The people whose request still waits for the owner, in LinkedIn's order, each once.
   public static async people(userId: string, accountIds: string[], take: number) {
      const rows = await PrismaService.client.linkedInInvitation.findMany({
         where: {
            userId,
            accountId: { in: accountIds },
            status: 'PENDING',
         },
         orderBy: [{ position: 'asc' }, { id: 'asc' }],
         distinct: ['slug'],
         take,
         select: {
            slug: true,
            name: true,
            headline: true,
            note: true,
         },
      })

      return rows.map(row => ({
         slug: row.slug,
         url: profileUrlOf(row.slug),
         name: row.name,
         headline: row.headline,
         note: row.note ? row.note.slice(0, NOTE_MAX) : null,
      }))
   }
}
