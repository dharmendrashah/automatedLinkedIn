import { TakeoverRelay } from 'core'

import { type TakeoverFrame, type TakeoverInput } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'

// The same answer for a run that is not the user's, does not exist, or is not waiting for anyone.
export class TakeoverNotFoundError extends Error {
   public constructor() {
      super('That run is not waiting for you.')
      this.name = 'TakeoverNotFoundError'
   }
}

// Who may take over a run: only its owner, only while it runs. The relay itself knows nothing about users, so every
// call here checks the run against the database first.
export class TakeoverService {
   public static async listForUser(userId: string) {
      const held = TakeoverRelay.heldIds()

      if (held.length === 0) {
         return []
      }

      const rows = await PrismaService.client.spiderSession.findMany({
         where: {
            id: { in: held },
            userId,
            status: 'IN_PROGRESS',
         },
         select: {
            id: true,
            task: true,
            linkedInAccount: { select: { email: true } },
         },
      })

      return rows.flatMap(({ id, task, linkedInAccount }) => {
         const frame = TakeoverRelay.latest(id)

         return frame
            ? [
                 {
                    id,
                    task,
                    accountEmail: linkedInAccount.email,
                    expiresAt: frame.expires_at,
                 },
              ]
            : []
      })
   }

   public static async frameForUser(userId: string, id: string): Promise<TakeoverFrame> {
      return this.held(userId, id)
   }

   public static async sendForUser(userId: string, id: string, input: TakeoverInput) {
      await this.held(userId, id)
      await TakeoverRelay.send(id, input)
   }

   private static async held(userId: string, id: string) {
      const owned = await PrismaService.client.spiderSession.findFirst({
         where: {
            id,
            userId,
            status: 'IN_PROGRESS',
         },
         select: { id: true },
      })
      const frame = owned ? TakeoverRelay.latest(id) : undefined

      if (!frame) {
         throw new TakeoverNotFoundError()
      }

      return frame
   }
}
