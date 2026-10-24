import { parseLinkedInUrl } from 'core'

import { VIEW_PROFILE_TASK } from './linkedInViewProfile.hooks'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskRefusedError } from './taskErrors'

// How many profiles one account may view in 24 hours, and how long it leaves the same person alone (.plan/visit-profile-task.md).
// Both are refusals the owner cannot confirm past: they are what keeps a visit a deliberate act and not a sweep.
export const VISITS_PER_DAY = 15
export const REPEAT_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// A refusal the owner can read; the router says it like any other refused task.
export class ProfileVisitRefusedError extends TaskRefusedError {}

export type ProfileVisitTarget = { profileId: string } | { link: string }

// The slug of the account's own profile, from the profile read of the account, when there is one.
const ownSlug = async (accountId: string) => {
   const row = await PrismaService.client.linkedInAccountProfile.findFirst({
      where: { accountId },
      select: { data: true },
   })
   const url = (row?.data as { profileUrl?: unknown } | null | undefined)?.profileUrl

   return typeof url === 'string' ? parseLinkedInUrl(url, 'profile')?.slug : undefined
}

// Who is to be viewed: the owner's saved profile, or a pasted link (tied to the saved profile of the same person when there is one).
// Null for a saved profile that is not the owner's.
const resolve = async (userId: string, target: ProfileVisitTarget) => {
   if ('profileId' in target) {
      const found = await PrismaService.client.linkedInProfile.findFirst({
         where: {
            id: target.profileId,
            userId,
            archivedAt: null,
         },
         select: {
            id: true,
            slug: true,
         },
      })

      return found
         ? {
              slug: found.slug,
              savedId: found.id,
           }
         : null
   }

   const link = parseLinkedInUrl(target.link, 'profile')

   if (!link) {
      throw new ProfileVisitRefusedError('That is not a link to a LinkedIn profile.')
   }

   const saved = await PrismaService.client.linkedInProfile.findFirst({
      where: {
         userId,
         slug: link.slug,
         archivedAt: null,
      },
      select: { id: true },
   })

   return {
      slug: link.slug,
      savedId: saved?.id ?? null,
   }
}

// Asks for one visit to a profile as one of the owner's accounts: the owner's saved profile or a pasted link. Every limit is checked
// here, and the visit is saved in the same transaction as the task. Resolves to null for a profile or an account that is not the
// owner's (answered like a missing one).
export class ProfileVisitService {
   public static async request(
      userId: string,
      accountId: string,
      target: ProfileVisitTarget,
      confirmed?: boolean
   ): Promise<{ id: string } | null> {
      const who = await resolve(userId, target)

      if (!who) {
         return null
      }

      const { slug, savedId } = who
      const account = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id: accountId,
            userId,
         },
         select: { id: true },
      })

      if (!account) {
         return null
      }

      if ((await ownSlug(accountId)) === slug) {
         throw new ProfileVisitRefusedError('That is the profile of this account itself.')
      }

      const now = Date.now()
      const repeat = await PrismaService.client.linkedInProfileVisit.findFirst({
         where: {
            accountId,
            slug,
            status: { in: ['ASKED', 'DONE'] },
            createdAt: { gte: new Date(now - REPEAT_DAYS * DAY_MS) },
         },
         select: { id: true },
      })

      if (repeat) {
         throw new ProfileVisitRefusedError(`This account already viewed that profile in the last ${REPEAT_DAYS} days.`)
      }

      const today = await PrismaService.client.linkedInProfileVisit.count({
         where: {
            accountId,
            createdAt: { gte: new Date(now - DAY_MS) },
         },
      })

      if (today >= VISITS_PER_DAY) {
         throw new ProfileVisitRefusedError(
            `This account has reached its limit of ${VISITS_PER_DAY} profile views in 24 hours.`
         )
      }

      return TaskService.request({
         userId,
         task: VIEW_PROFILE_TASK,
         accountId,
         trigger: 'manual',
         confirmed,
         input: { profileUrl: `https://www.linkedin.com/in/${encodeURIComponent(slug)}/` },
         onStart: async (sessionId, tx) => {
            await tx.linkedInProfileVisit.create({
               data: {
                  userId,
                  accountId,
                  profileId: savedId,
                  slug,
                  sessionId,
               },
            })
         },
      })
   }
}
