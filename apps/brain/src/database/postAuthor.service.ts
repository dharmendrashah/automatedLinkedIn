import { type PostSnapshotData, parseLinkedInUrl } from 'core'

import { CompanyPageService } from './companyPage.service'
import { ConflictError } from './conflict'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PeopleIndexService } from './peopleIndex.service'
import { PersonService } from './person.service'
import { PersonSnapshotService } from './personSnapshot.service'
import { PrismaService } from './prisma.service'

// The author of a read post joins My network (a person) or /companies (a company page) and is read once
// (.plan/post-authors-network.md). Someone the owner already knows, removed or must not contact is left alone.

export const FROM_POSTS = 'from posts'

type Author = PostSnapshotData['author']

const known = async (userId: string, slug: string) => {
   const where = {
      userId_slug: {
         userId,
         slug,
      },
   }
   const [profile, person, member, suppressed] = await Promise.all([
      PrismaService.client.linkedInProfile.findUnique({
         where,
         select: { id: true },
      }),
      PrismaService.client.person.findFirst({
         where: {
            userId,
            slug,
         },
         select: { id: true },
      }),
      PrismaService.client.workflowListMember.findFirst({
         where: {
            slug,
            list: { userId },
         },
         select: { id: true },
      }),
      PrismaService.client.suppression.findUnique({
         where,
         select: { id: true },
      }),
   ])

   return Boolean(profile || person || member || suppressed)
}

const keepPerson = async (userId: string, url: string) => {
   const link = parseLinkedInUrl(url, 'profile')

   if (!link || (await known(userId, link.slug))) {
      return
   }

   await LinkedInProfileService.addMany(userId, [link], [FROM_POSTS])
   await PeopleIndexService.refresh(userId, [link.slug])

   if ((await PersonSnapshotService.recent(userId, [link.slug])).has(link.slug)) {
      return
   }

   try {
      await PersonService.readFull(userId, link.slug)
   } catch (error) {
      if (!(error instanceof ConflictError)) {
         throw error
      }
   }
}

const keepCompany = async (userId: string, url: string) => {
   const link = parseLinkedInUrl(url, 'company')

   if (!link || (await LinkedInCompanyService.bySlug(userId, link.slug))) {
      return
   }

   await LinkedInCompanyService.addMany(userId, [link], [FROM_POSTS])
   await CompanyPageService.readMany(userId, { slug: link.slug })
}

export class PostAuthorService {
   public static async keep(userId: string, author: Author) {
      if (!author.url) {
         return
      }

      await (author.isCompany ? keepCompany(userId, author.url) : keepPerson(userId, author.url))
   }
}
