import { TakeoverRelay } from 'core'

import { type TakeoverFrame, type TakeoverInput } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'

const REMEMBER_OWNER_MS = 10_000
const MAX_REMEMBERED = 200

// The same answer for a run that is not the user's, does not exist, or is not waiting for anyone.
export class TakeoverNotFoundError extends Error {
   public constructor() {
      super('That run is not waiting for you.')
      this.name = 'TakeoverNotFoundError'
   }
}

// Who may take over a run: only its owner, only while it runs. The relay itself knows nothing about users, so every
// call here checks the run against the database first. The dialog asks several times a second, so a yes is remembered for
// a few seconds; a run stops being offered when the worker lets go of it, whatever is remembered here.
export class TakeoverService {
   private static readonly owned = new Map<string, number>()

   public static resetCache() {
      this.owned.clear()
   }

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
      const key = `${userId}:${id}`
      const now = Date.now()
      let owns = (this.owned.get(key) ?? 0) > now

      if (!owns) {
         const owned = await PrismaService.client.spiderSession.findFirst({
            where: {
               id,
               userId,
               status: 'IN_PROGRESS',
            },
            select: { id: true },
         })

         owns = Boolean(owned)

         if (owns) {
            if (this.owned.size >= MAX_REMEMBERED) {
               this.owned.clear()
            }

            this.owned.set(key, now + REMEMBER_OWNER_MS)
         }
      }

      const frame = owns ? TakeoverRelay.latest(id) : undefined

      if (!frame) {
         throw new TakeoverNotFoundError()
      }

      return frame
   }
}
