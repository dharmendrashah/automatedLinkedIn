import { MessageFiles } from 'core'

import { type Prisma } from 'generated/prisma/client'

import { accountProfileSchema } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'

// A finished `linkedin-profile` run is stored by the worker, outside the transaction that finished it (a hook makes no network
// call), the same way as the messages (.plan/account-profile-backend.md). The row says "to store", a lease keeps two workers off
// it, and storing is idempotent, so a retry is always safe.
const LEASE_S = 300
const BATCH = 5
const MAX_ATTEMPTS = 5
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000]

// Dates in the tables are UTC without a zone, so the database clock is compared in UTC too.
const NOW = "timezone('UTC', now())"

const PROFILE_FILE = 'profile.json'

type Read = (path: string) => Promise<string>

class MissingSessionError extends Error {
   public constructor() {
      super('The session is gone')
      this.name = 'MissingSessionError'
   }
}

type Claimed = {
   sessionId: string
   attempts: number
}

export class ProfileImportService {
   // Stores what the worker's due imports hold. One that fails is tried again later; none stops the others.
   public static async importDue(signal?: AbortSignal, read?: Read) {
      const run = {
         done: 0,
         retried: 0,
         failed: 0,
      }
      const claimed = await PrismaService.client.$queryRawUnsafe<Claimed[]>(
         `UPDATE "ProfileImport"
          SET "claimedUntil" = ${NOW} + ${LEASE_S}::float8 * interval '1 second'
          WHERE "sessionId" IN (
             SELECT "sessionId" FROM "ProfileImport"
             WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${NOW} AND ("claimedUntil" IS NULL OR "claimedUntil" < ${NOW})
             ORDER BY "nextAttemptAt" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED
          )
          RETURNING "sessionId", "attempts"`
      )

      for (const { sessionId, attempts } of claimed) {
         if (signal?.aborted) {
            break
         }

         const outcome = await this.run(sessionId, attempts, read)

         if (outcome === 'done') {
            run.done += 1
         } else if (outcome === 'retry') {
            run.retried += 1
         } else {
            run.failed += 1
         }
      }

      return run
   }

   // Reads the profile file of one run and stores it for the owner and the account of the session: both come from the session row,
   // never from the file. A partial read never replaces a stored profile, and an older read never replaces a newer one. Never
   // throws; a failure is written on the row as its kind only, never a message.
   public static async run(sessionId: string, attempts: number, read: Read = MessageFiles.read.bind(MessageFiles)) {
      try {
         const session = await PrismaService.client.spiderSession.findUnique({
            where: { id: sessionId },
            select: {
               userId: true,
               linkedInAccountId: true,
               verdict: true,
               artifacts: {
                  where: {
                     kind: 'file',
                     name: PROFILE_FILE,
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
            const profile = accountProfileSchema.parse(JSON.parse(await read(artifact.path)))
            const capturedAt = new Date(profile.captured_at)
            const stored = await PrismaService.client.linkedInAccountProfile.findUnique({
               where: { accountId: session.linkedInAccountId },
               select: { capturedAt: true },
            })
            const keepStored = stored && (session.verdict !== 'DONE' || stored.capturedAt >= capturedAt)

            if (!keepStored) {
               const row = {
                  userId: session.userId,
                  data: profile as Prisma.InputJsonValue,
                  capturedAt,
                  importedAt: new Date(),
                  sessionId,
               }

               await PrismaService.client.linkedInAccountProfile.upsert({
                  where: { accountId: session.linkedInAccountId },
                  create: {
                     accountId: session.linkedInAccountId,
                     ...row,
                  },
                  update: row,
               })
            }
         }

         await PrismaService.client.profileImport.updateMany({
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

         await PrismaService.client.profileImport.updateMany({
            where: { sessionId },
            data: {
               status: last ? 'FAILED' : 'PENDING',
               attempts: failures,
               nextAttemptAt: new Date(Date.now() + (BACKOFF_MS[attempts] ?? BACKOFF_MS.at(-1) ?? 0)),
               claimedUntil: null,
               lastError: (error as Error).name,
            },
         })
         console.error(`worker profile-import could not store ${sessionId}: ${(error as Error).name}`)

         return last ? ('failed' as const) : ('retry' as const)
      }
   }
}
