import { parseLinkedInUrl } from 'core'

import { VIEW_COMPANY_TASK, VIEW_PROFILE_TASK } from './linkedInPageVisit.hooks'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskRefusedError } from './taskErrors'

// How many pages one account may view in 24 hours (profiles and companies together), and how long it leaves the same one alone
// (.plan/visit-profile-task.md, .plan/visit-company-task.md). Both are refusals the owner cannot confirm past: they are what keeps a
// visit a deliberate act and not a sweep.
export const VISITS_PER_DAY = 15
export const REPEAT_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// A refusal the owner can read; the router says it like any other refused task.
export class PageVisitRefusedError extends TaskRefusedError {}

type Kind = 'PROFILE' | 'COMPANY'

// A saved profile or company of the owner, or a link pasted for this visit (which says what it is a link to).
export type PageVisitTarget = { profileId: string } | { companyId: string } | { kind: Kind; link: string }

const NOUN: Record<Kind, string> = {
   PROFILE: 'profile',
   COMPANY: 'company page',
}

// The slug of the account's own profile, from the profile read of the account, when there is one.
const ownSlug = async (accountId: string) => {
   const row = await PrismaService.client.linkedInAccountProfile.findFirst({
      where: { accountId },
      select: { data: true },
   })
   const url = (row?.data as { profileUrl?: unknown } | null | undefined)?.profileUrl

   return typeof url === 'string' ? parseLinkedInUrl(url, 'profile')?.slug : undefined
}

const savedProfile = (where: { id: string } | { slug: string }, userId: string) =>
   PrismaService.client.linkedInProfile.findFirst({
      where: {
         ...where,
         userId,
         archivedAt: null,
      },
      select: {
         id: true,
         slug: true,
      },
   })

const savedCompany = (where: { id: string } | { slug: string }, userId: string) =>
   PrismaService.client.linkedInCompany.findFirst({
      where: {
         ...where,
         userId,
         archivedAt: null,
      },
      select: {
         id: true,
         slug: true,
      },
   })

// Who is to be viewed: a saved profile or company, or a pasted link (tied to the saved one of the same name when there is one).
// Null for a saved one that is not the owner's.
const resolve = async (userId: string, target: PageVisitTarget) => {
   if ('profileId' in target || 'companyId' in target) {
      const kind: Kind = 'profileId' in target ? 'PROFILE' : 'COMPANY'
      const found =
         'profileId' in target
            ? await savedProfile({ id: target.profileId }, userId)
            : await savedCompany({ id: target.companyId }, userId)

      return found
         ? {
              kind,
              slug: found.slug,
              savedId: found.id,
           }
         : null
   }

   const { kind } = target
   const link = parseLinkedInUrl(target.link, kind === 'PROFILE' ? 'profile' : 'company')

   if (!link) {
      throw new PageVisitRefusedError(`That is not a link to a LinkedIn ${NOUN[kind]}.`)
   }

   const saved =
      kind === 'PROFILE'
         ? await savedProfile({ slug: link.slug }, userId)
         : await savedCompany({ slug: link.slug }, userId)

   return {
      kind,
      slug: link.slug,
      savedId: saved?.id ?? null,
   }
}

const addressOf = (kind: Kind, slug: string) =>
   kind === 'PROFILE'
      ? {
           task: VIEW_PROFILE_TASK,
           input: { profileUrl: `https://www.linkedin.com/in/${encodeURIComponent(slug)}/` },
        }
      : {
           task: VIEW_COMPANY_TASK,
           input: { companyUrl: `https://www.linkedin.com/company/${encodeURIComponent(slug)}/` },
        }

// Asks for one visit to a profile or a company page as one of the owner's accounts. Every limit is checked here, and the visit is
// saved in the same transaction as the task. Resolves to null for a saved page or an account that is not the owner's (answered like
// a missing one).
export class PageVisitService {
   public static async request(
      userId: string,
      accountId: string,
      target: PageVisitTarget,
      confirmed?: boolean
   ): Promise<{ id: string } | null> {
      const who = await resolve(userId, target)

      if (!who) {
         return null
      }

      const { kind, slug, savedId } = who
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

      if (kind === 'PROFILE' && (await ownSlug(accountId)) === slug) {
         throw new PageVisitRefusedError('That is the profile of this account itself.')
      }

      const now = Date.now()
      const repeat = await PrismaService.client.linkedInPageVisit.findFirst({
         where: {
            accountId,
            kind,
            slug,
            status: { in: ['ASKED', 'DONE'] },
            createdAt: { gte: new Date(now - REPEAT_DAYS * DAY_MS) },
         },
         select: { id: true },
      })

      if (repeat) {
         throw new PageVisitRefusedError(
            `This account already viewed that ${NOUN[kind]} in the last ${REPEAT_DAYS} days.`
         )
      }

      const today = await PrismaService.client.linkedInPageVisit.count({
         where: {
            accountId,
            createdAt: { gte: new Date(now - DAY_MS) },
         },
      })

      if (today >= VISITS_PER_DAY) {
         throw new PageVisitRefusedError(
            `This account has reached its limit of ${VISITS_PER_DAY} page views in 24 hours.`
         )
      }

      return TaskService.request({
         userId,
         accountId,
         trigger: 'manual',
         confirmed,
         ...addressOf(kind, slug),
         onStart: async (sessionId, tx) => {
            await tx.linkedInPageVisit.create({
               data: {
                  userId,
                  accountId,
                  kind,
                  profileId: kind === 'PROFILE' ? savedId : null,
                  companyId: kind === 'COMPANY' ? savedId : null,
                  slug,
                  sessionId,
               },
            })
         },
      })
   }
}
