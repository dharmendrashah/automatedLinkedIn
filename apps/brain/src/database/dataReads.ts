import {
   commentsSnapshotFrom,
   companiesOf,
   companySnapshotFrom,
   postSnapshotFrom,
   reactionsSnapshotFrom,
   snapshotFrom,
} from 'core'

import { type DataReadKind, type PageKind, type Prisma } from 'generated/prisma/client'

import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { connectionsOf, conversationsWith } from './personContacts'
import { PersonSnapshotService } from './personSnapshot.service'
import { PrismaService } from './prisma.service'

// What each kind of on-demand read is called, keeps when it finishes, and whether it is still wanted. Messages are
// shown to the client, so they never name the data supplier.

type Row = Record<string, unknown>
export type ReadRows = [Row, ...Row[]]
type Read = { userId: string; slug: string; params: Record<string, unknown> }

type ReadSpec = {
   noun: string
   // What the monthly statement calls these reads.
   label: string
   missing: string
   wanted: (userId: string, slug: string) => Promise<boolean>
   store: (read: Read, rows: ReadRows) => Promise<void>
}

const whereSlug = (userId: string, slug: string) => ({
   userId_slug: {
      userId,
      slug,
   },
})

// A person is read only while they are in /profiles, a list, a connection of the owner's accounts or one of their conversations, and
// may be contacted.
const personWanted = async (userId: string, slug: string) => {
   const [profile, member, suppressed, connections, conversations] = await Promise.all([
      PrismaService.client.linkedInProfile.findUnique({
         where: whereSlug(userId, slug),
         select: { archivedAt: true },
      }),
      PrismaService.client.workflowListMember.findFirst({
         where: {
            slug,
            list: { userId },
         },
         select: { id: true },
      }),
      PrismaService.client.suppression.findUnique({
         where: whereSlug(userId, slug),
         select: { id: true },
      }),
      connectionsOf(userId, slug),
      conversationsWith(userId, slug),
   ])

   return (
      !suppressed &&
      Boolean(member || (profile && !profile.archivedAt) || connections.length > 0 || conversations.length > 0)
   )
}

const companyWanted = async (userId: string, slug: string) => {
   const company = await LinkedInCompanyService.bySlug(userId, slug)

   return Boolean(company && !company.archivedAt)
}

const postWanted = async (userId: string, slug: string) => {
   const post = await LinkedInPostService.bySlug(userId, slug)

   return Boolean(post && !post.archivedAt)
}

const keepPage = (userId: string, kind: PageKind, slug: string, data: Prisma.InputJsonValue) =>
   PrismaService.client.pageSnapshot.upsert({
      where: {
         userId_kind_slug: {
            userId,
            kind,
            slug,
         },
      },
      create: {
         userId,
         kind,
         slug,
         data,
      },
      update: {
         data,
         fetchedAt: new Date(),
      },
   })

const limitOf = (params: Record<string, unknown>) => (typeof params.maxResults === 'number' ? params.maxResults : 0)

export const DATA_READS: Record<DataReadKind, ReadSpec> = {
   PROFILE: {
      noun: 'this profile',
      label: 'Profile reads',
      missing: 'No profile was found at this link.',
      wanted: personWanted,
      store: async ({ userId, slug }, [row]) => {
         const snapshot = snapshotFrom(row)

         await PersonSnapshotService.save(userId, slug, snapshot)
         await LinkedInCompanyService.saveFound(userId, companiesOf(snapshot))
      },
   },
   COMPANY: {
      noun: 'this company page',
      label: 'Company reads',
      missing: 'No company page was found at this link.',
      wanted: companyWanted,
      store: async ({ userId, slug }, [row]) => {
         await keepPage(userId, 'COMPANY', slug, companySnapshotFrom(row))
      },
   },
   POST: {
      noun: 'this post',
      label: 'Post reads',
      missing: 'No post was found at this link.',
      wanted: postWanted,
      store: async ({ userId, slug }, [row]) => {
         await keepPage(userId, 'POST', slug, postSnapshotFrom(row))
      },
   },
   COMMENTS: {
      noun: 'the comments on this post',
      label: 'Comment reads',
      missing: 'No comments were found on this post.',
      wanted: postWanted,
      store: async ({ userId, slug, params }, rows) => {
         await keepPage(userId, 'POST_COMMENTS', slug, commentsSnapshotFrom(rows, limitOf(params)))
      },
   },
   REACTIONS: {
      noun: 'the reactions on this post',
      label: 'Reaction reads',
      missing: 'No reactions were found on this post.',
      wanted: postWanted,
      store: async ({ userId, slug, params }, rows) => {
         await keepPage(userId, 'POST_REACTIONS', slug, reactionsSnapshotFrom(rows, limitOf(params)))
      },
   },
}
