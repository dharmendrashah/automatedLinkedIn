import { MessageFiles } from 'core'

import { invitesFileSchema } from '@automatedLinkedIn/contracts'

import { LinkedInInviteService } from './linkedInInvite.service'
import { PrismaService } from './prisma.service'

// A finished `linkedin-invite` run is stored by the worker, outside the transaction that finished it, the same way as the requests
// (InvitationImportService): the row says "to store", a lease keeps two workers off it, and storing is idempotent.
const LEASE_S = 300
const BATCH = 5
const MAX_ATTEMPTS = 5
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000]
const NOW = "timezone('UTC', now())"
const FILE = 'invites.json'

type Read = (path: string) => Promise<string>

class MissingSessionError extends Error {
   public constructor() {
      super('The session is gone')
      this.name = 'MissingSessionError'
   }
}

export class InviteImportService {
   public static async importDue(signal?: AbortSignal, read?: Read) {
      const run = {
         done: 0,
         retried: 0,
         failed: 0,
      }
      const claimed = await PrismaService.client.$queryRawUnsafe<Array<{ sessionId: string; attempts: number }>>(
         `UPDATE "InviteImport"
          SET "claimedUntil" = ${NOW} + ${LEASE_S}::float8 * interval '1 second'
          WHERE "sessionId" IN (
             SELECT "sessionId" FROM "InviteImport"
             WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${NOW} AND ("claimedUntil" IS NULL OR "claimedUntil" < ${NOW})
             ORDER BY "nextAttemptAt" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED
          )
          RETURNING "sessionId", "attempts"`
      )

      for (const { sessionId, attempts } of claimed) {
         if (signal?.aborted) {
            break
         }

         run[await this.run(sessionId, attempts, read)] += 1
      }

      return run
   }

   // Reads the file of one run and settles its invites. A run without the file has nothing to store. Never throws; a failure is
   // written on the row as its kind only.
   public static async run(sessionId: string, attempts: number, read: Read = MessageFiles.read.bind(MessageFiles)) {
      try {
         const session = await PrismaService.client.spiderSession.findUnique({
            where: { id: sessionId },
            select: {
               artifacts: {
                  where: {
                     kind: 'file',
                     name: FILE,
                  },
                  select: { path: true },
               },
            },
         })

         if (!session) {
            throw new MissingSessionError()
         }

         const [artifact] = session.artifacts

         if (artifact) {
            await LinkedInInviteService.store(sessionId, invitesFileSchema.parse(JSON.parse(await read(artifact.path))))
         }

         await PrismaService.client.inviteImport.updateMany({
            where: { sessionId },
            data: {
               status: 'DONE',
               importedAt: new Date(),
               claimedUntil: null,
               lastError: null,
            },
         })

         return 'done' as const
      } catch (error) {
         const failures = attempts + 1
         const last = error instanceof MissingSessionError || failures >= MAX_ATTEMPTS

         await PrismaService.client.inviteImport.updateMany({
            where: { sessionId },
            data: {
               status: last ? 'FAILED' : 'PENDING',
               attempts: failures,
               nextAttemptAt: new Date(Date.now() + (BACKOFF_MS[attempts] ?? BACKOFF_MS.at(-1) ?? 0)),
               claimedUntil: null,
               lastError: (error as Error).name,
            },
         })
         console.error(`worker invite-import could not store ${sessionId}: ${(error as Error).name}`)

         return last ? ('failed' as const) : ('retried' as const)
      }
   }
}
