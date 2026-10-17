import { type PersonSnapshotData, readSnapshot, snapshotFrom } from 'core'
import { type DataClient, DataServiceError } from 'core/dataClient'

import { PRICE_MICROS } from '@automatedLinkedIn/contracts'

import { ConflictError, uniqueOr } from './conflict'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PrismaService } from './prisma.service'
import { WalletService } from './wallet.service'
import { WorkflowListService } from './workflowList.service'

// One person as the owner knows them, by profile slug: their /profiles row, their list membership, do-not-contact,
// and the full profile they chose to read. Messages are shown to the client, so they never name the data supplier.

export type ProfileReader = Pick<DataClient, 'collect'>

const whereSlug = (userId: string, slug: string) => ({
   userId_slug: {
      userId,
      slug,
   },
})

const READ_FAILED = 'Reading the profile did not work. Please try again later.'

export class PersonService {
   // null when the person is in neither /profiles nor a list of the owner.
   public static async detail(userId: string, slug: string) {
      const [profile, member, suppressed, snapshot] = await Promise.all([
         LinkedInProfileService.bySlug(userId, slug),
         WorkflowListService.memberBySlug(userId, slug),
         PrismaService.client.suppression.findUnique({
            where: whereSlug(userId, slug),
            select: { id: true },
         }),
         PrismaService.client.personSnapshot.findUnique({
            where: whereSlug(userId, slug),
            select: {
               data: true,
               fetchedAt: true,
            },
         }),
      ])
      const url = profile?.url ?? member?.url

      if (!url) {
         return null
      }

      const full: PersonSnapshotData | null = snapshot ? readSnapshot(snapshot.data) : null

      return {
         slug,
         url,
         profile,
         member,
         suppressed: suppressed !== null,
         snapshot:
            full && snapshot
               ? {
                    ...full,
                    fetchedAt: snapshot.fetchedAt,
                 }
               : null,
         readPriceMicros: PRICE_MICROS.profile,
      }
   }

   // Pays one full-profile read and keeps it. Once a day per person: a second click the same day, or a double click,
   // pays nothing. null when the person is not the owner's.
   public static async readFull(userId: string, slug: string, reader: ProfileReader) {
      const known = await PersonService.detail(userId, slug)

      if (!known) {
         return null
      }

      if (known.suppressed) {
         throw new ConflictError('This person is marked do not contact.')
      }

      if (await WalletService.belowFloor()) {
         throw new ConflictError('Profile reads are paused for a short while. Please try again later.')
      }

      const day = new Date().toISOString().slice(0, 10)
      const callId = `profile-read:${userId}:${slug}:${day}`

      await uniqueOr(
         PrismaService.client.spendLedger.create({
            data: {
               userId,
               callId,
               amountMicros: 0,
               month: day.slice(0, 7),
            },
         }),
         'This profile was already read today.'
      )

      let charged = false

      try {
         const outcome = await reader.collect(
            'profiles',
            { queries: [known.url] },
            {
               jobId: null,
               onJobId: async () => undefined,
            }
         )

         charged = outcome.costMicros > 0
         await PrismaService.client.spendLedger.update({
            where: { callId },
            data: { amountMicros: outcome.costMicros },
         })

         const [row] = outcome.status === 'completed' ? outcome.rows : []

         if (!row) {
            throw new ConflictError('No profile was found at this link.')
         }

         const data = snapshotFrom(row)

         await PrismaService.client.personSnapshot.upsert({
            where: whereSlug(userId, slug),
            create: {
               userId,
               slug,
               data,
            },
            update: {
               data,
               fetchedAt: new Date(),
            },
         })
      } catch (error) {
         // Nothing was paid, so the owner may try again today.
         if (!charged) {
            await PrismaService.client.spendLedger.deleteMany({ where: { callId } })
         }

         throw error instanceof DataServiceError ? new ConflictError(READ_FAILED) : error
      }

      return PersonService.detail(userId, slug)
   }
}
