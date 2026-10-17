import { type PersonSnapshotData, readSnapshot, snapshotFrom } from 'core'

import { PRICE_MICROS } from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { LinkedInProfileService } from './linkedInProfile.service'
import { type PageReader, paidRead } from './paidRead'
import { PrismaService } from './prisma.service'
import { WorkflowListService } from './workflowList.service'

// One person as the owner knows them, by profile slug: their /profiles row, their list membership, do-not-contact,
// and the full profile they chose to read. Messages are shown to the client, so they never name the data supplier.

export type ProfileReader = PageReader

const whereSlug = (userId: string, slug: string) => ({
   userId_slug: {
      userId,
      slug,
   },
})

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

   // Pays one full-profile read and keeps it (see `paidRead`). null when the person is not the owner's.
   public static async readFull(userId: string, slug: string, reader: ProfileReader) {
      const known = await PersonService.detail(userId, slug)

      if (!known) {
         return null
      }

      if (known.suppressed) {
         throw new ConflictError('This person is marked do not contact.')
      }

      await paidRead({
         userId,
         kind: 'profile',
         slug,
         operation: 'profiles',
         params: { queries: [known.url] },
         reader,
         store: async row => {
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
         },
      })

      return PersonService.detail(userId, slug)
   }
}
