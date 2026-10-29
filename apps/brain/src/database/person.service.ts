import { type PersonSnapshotData, readSnapshot } from 'core'

import { PRICE_MICROS } from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { DataReadService } from './dataRead.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { connectionsOf, conversationsWith, profileUrlOf } from './personContacts'
import { PrismaService } from './prisma.service'
import { WorkflowListService } from './workflowList.service'

// One person as the owner knows them, by profile slug: their /profiles row, their list membership, do-not-contact,
// and the full profile they chose to read. Messages are shown to the client, so they never name the data supplier.

const whereSlug = (userId: string, slug: string) => ({
   userId_slug: {
      userId,
      slug,
   },
})

export class PersonService {
   // null when the person is in no /profiles row, no list, no connection and no conversation of the owner.
   public static async detail(userId: string, slug: string) {
      const [profile, member, suppressed, snapshot, connections, conversations] = await Promise.all([
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
         connectionsOf(userId, slug),
         conversationsWith(userId, slug),
      ])
      const url =
         profile?.url ??
         member?.url ??
         (connections.length > 0 || conversations.length > 0 ? profileUrlOf(slug) : undefined)

      if (!url) {
         return null
      }

      const full: PersonSnapshotData | null = snapshot ? readSnapshot(snapshot.data) : null

      return {
         slug,
         url,
         profile,
         member,
         // The owner's accounts connected to them, and the conversations the accounts have with them (Unibox).
         connections,
         conversations,
         suppressed: suppressed !== null,
         snapshot:
            full && snapshot
               ? {
                    ...full,
                    fetchedAt: snapshot.fetchedAt,
                 }
               : null,
         readPriceMicros: PRICE_MICROS.profile,
         read: await DataReadService.latest(userId, 'PROFILE', slug),
      }
   }

   // Queues one full-profile read for the worker. null when the person is not the owner's.
   public static async readFull(userId: string, slug: string) {
      const known = await PersonService.detail(userId, slug)

      if (!known) {
         return null
      }

      if (known.suppressed) {
         throw new ConflictError('This person is marked do not contact.')
      }

      await DataReadService.queue({
         userId,
         kind: 'PROFILE',
         slug,
         operation: 'profiles',
         params: { queries: [known.url] },
      })

      return PersonService.detail(userId, slug)
   }
}
