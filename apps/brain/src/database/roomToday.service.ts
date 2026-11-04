import { type AccountRoom, AccountRoomService, roomLeft } from './accountRoom.service'
import { LinkedInInviteService } from './linkedInInvite.service'
import { PrismaService } from './prisma.service'

export type RoomAction = 'invite' | 'message' | 'reply' | 'reaction' | 'comment'

export type AccountRoomToday = {
   accountId: string
   // What the owner reads: the display name, else the sign-in email.
   name: string
   signedIn: boolean
   // What it may still do today, and its limit of the day.
   left: number
   limit: number
   // What fits inside the days asked for (invites only; the same as `left` for the other acts).
   within: number
   // Too many invites are pending, so no new one is planned.
   paused: boolean
}

const NONE = {
   left: 0,
   limit: 0,
   within: 0,
   paused: false,
}

// What each of an owner's accounts may still do today for one kind of act (.plan/lead-pipeline-p1-foundations.md). Invites use the
// planner's own numbers; the others count the rolling 24 hours. An account that is not signed in, or not the owner's, has no room.
export class RoomTodayService {
   public static async forAccounts(
      userId: string,
      accountIds: string[],
      action: RoomAction,
      now = new Date(),
      days = 1
   ): Promise<AccountRoomToday[]> {
      const accounts = await PrismaService.client.linkedInAccount.findMany({
         where: {
            userId,
            id: { in: accountIds },
         },
         select: {
            id: true,
            status: true,
            displayName: true,
            email: true,
         },
      })
      const byId = new Map(accounts.map(account => [account.id, account]))
      const known = accountIds.flatMap(id => byId.get(id) ?? [])
      const signedIn = known.filter(({ status }) => status === 'ACTIVE').map(({ id }) => id)
      const rooms: Map<string, AccountRoom> =
         action === 'invite' ? new Map() : await AccountRoomService.forAccounts(signedIn, now)

      return Promise.all(
         known.map(async ({ id, status, displayName, email }) => {
            const open = status === 'ACTIVE'
            const room = rooms.get(id)
            const measure = !open
               ? NONE
               : action === 'invite'
                 ? await LinkedInInviteService.roomToday(id, now, days)
                 : room
                   ? this.measure(room, action)
                   : NONE

            return {
               accountId: id,
               name: displayName ?? email,
               signedIn: open,
               ...measure,
            }
         })
      )
   }

   private static measure(room: AccountRoom, action: Exclude<RoomAction, 'invite'>) {
      const measure = {
         message: room.firstMessages,
         reply: room.replies,
         reaction: room.reactions,
         comment: room.comments,
      }[action]
      const left = roomLeft(measure)

      return {
         left,
         limit: measure.limit,
         within: left,
         paused: false,
      }
   }
}
