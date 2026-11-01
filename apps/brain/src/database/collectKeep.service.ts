import {
   type CompanyItem,
   type CompanySnapshotData,
   type JobItem,
   type PersonItem,
   type PostItem,
   type WorkflowItemData,
   readCompanySnapshot,
} from 'core'

import { keepPage } from './dataReads'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { LinkedInPostService } from './linkedInPost.service'
import { LinkedInProfileService } from './linkedInProfile.service'
import { PeopleIndexService } from './peopleIndex.service'
import { PrismaService } from './prisma.service'

// What a block that finds people, companies, posts or jobs keeps in the owner's lists under the workflow's name
// (.plan/workflow-collect-blocks.md). Do not contact, suppressed and archived people, and archived companies, are never
// added. Anything already in a list is left as it is and only gets the label.

const DAY_MS = 24 * 60 * 60 * 1000

// A company page read this recently is used again instead of paid for.
export const COMPANY_REMEMBER_DAYS = 30
// A work email found this recently is used again instead of paid for.
export const EMAIL_REMEMBER_DAYS = 90

export type Kept = { people: number; companies: number; posts: number; jobs: number; skipped: number }

const slugsOf = (items: { slug: string }[]) => items.map(({ slug }) => slug)

// People who must not be added or paid for: on Do not contact for any client, suppressed, or archived by the owner.
const blockedPeople = async (userId: string, slugs: string[]) => {
   if (slugs.length === 0) {
      return new Set<string>()
   }

   const [refused, suppressed, archived] = await Promise.all([
      PrismaService.client.person.findMany({
         where: {
            userId,
            slug: { in: slugs },
            doNotContact: true,
         },
         select: { slug: true },
      }),
      PrismaService.client.suppression.findMany({
         where: {
            userId,
            slug: { in: slugs },
         },
         select: { slug: true },
      }),
      PrismaService.client.linkedInProfile.findMany({
         where: {
            userId,
            slug: { in: slugs },
            archivedAt: { not: null },
         },
         select: { slug: true },
      }),
   ])

   return new Set([...refused, ...suppressed, ...archived].map(({ slug }) => slug))
}

const keepPeople = async (userId: string, label: string, people: PersonItem[]) => {
   const blocked = await blockedPeople(userId, slugsOf(people))
   const allowed = people.filter(({ slug }) => !blocked.has(slug))

   if (allowed.length > 0) {
      await LinkedInProfileService.addMany(userId, allowed, [label])
      await LinkedInProfileService.fillDetails(userId, allowed)
      await PeopleIndexService.refresh(userId, slugsOf(allowed))
   }

   return {
      kept: allowed.length,
      skipped: blocked.size,
   }
}

const keepCompanies = async (userId: string, label: string, companies: CompanyItem[]) => {
   if (companies.length === 0) {
      return {
         kept: 0,
         skipped: 0,
      }
   }

   const archived = new Set(
      (
         await PrismaService.client.linkedInCompany.findMany({
            where: {
               userId,
               slug: { in: slugsOf(companies) },
               archivedAt: { not: null },
            },
            select: { slug: true },
         })
      ).map(({ slug }) => slug)
   )
   const allowed = companies.filter(({ slug }) => !archived.has(slug))

   await LinkedInCompanyService.addMany(userId, allowed, [label])
   await LinkedInCompanyService.fillNames(userId, allowed)

   for (const { slug, preview } of allowed) {
      if (preview) {
         await keepPage(userId, 'COMPANY', slug, preview)
         await LinkedInCompanyService.applyRead(userId, slug, preview)
      }
   }

   return {
      kept: allowed.length,
      skipped: archived.size,
   }
}

const keepPosts = async (userId: string, label: string, posts: PostItem[]) => {
   if (posts.length > 0) {
      await LinkedInPostService.addMany(userId, posts, [label])

      for (const { slug, preview } of posts) {
         if (preview) {
            await keepPage(userId, 'POST', slug, preview)
         }
      }
   }

   return posts.length
}

// A job belongs to its company: the company joins /companies under the label too.
const keepJobs = async (userId: string, label: string, jobs: JobItem[]) => {
   const now = new Date()

   for (const job of jobs) {
      const data = {
         url: job.url,
         title: job.title,
         companySlug: job.companySlug,
         companyName: job.company,
         location: job.location,
         posted: job.posted,
         workplace: job.workplace,
         employment: job.employment,
         applicants: job.applicants,
         salary: job.salary,
         lastSeenAt: now,
      }
      const where = {
         userId_jobId: {
            userId,
            jobId: job.slug,
         },
      }
      const known = await PrismaService.client.linkedInCompanyJob.findUnique({
         where,
         select: { tags: true },
      })

      await PrismaService.client.linkedInCompanyJob.upsert({
         where,
         create: {
            userId,
            jobId: job.slug,
            tags: [label],
            ...data,
         },
         update: {
            ...data,
            tags: [...new Set([...(known?.tags ?? []), label])],
         },
      })
   }

   const companies = jobs.flatMap(({ companySlug, company }) =>
      companySlug
         ? [
              {
                 kind: 'company' as const,
                 slug: companySlug,
                 url: `https://www.linkedin.com/company/${encodeURIComponent(companySlug)}`,
                 name: company,
                 hiring: [],
              },
           ]
         : []
   )
   const unique = [...new Map(companies.map(company => [company.slug, company])).values()]

   if (unique.length > 0) {
      await keepCompanies(userId, label, unique)
   }

   return jobs.length
}

export class CollectKeepService {
   // Keeps what a block found. Safe to run again for the same items: everything is an upsert.
   public static async keep(userId: string, label: string, items: WorkflowItemData[]): Promise<Kept> {
      const people = await keepPeople(
         userId,
         label,
         items.filter((item): item is PersonItem => item.kind === 'profile')
      )
      const companies = await keepCompanies(
         userId,
         label,
         items.filter((item): item is CompanyItem => item.kind === 'company')
      )
      const posts = await keepPosts(
         userId,
         label,
         items.filter((item): item is PostItem => item.kind === 'post')
      )
      const jobs = await keepJobs(
         userId,
         label,
         items.filter((item): item is JobItem => item.kind === 'job')
      )

      return {
         people: people.kept,
         companies: companies.kept,
         posts,
         jobs,
         skipped: people.skipped + companies.skipped,
      }
   }

   // The people a block must not read or pay for.
   public static blocked(userId: string, slugs: string[]) {
      return blockedPeople(userId, slugs)
   }

   // Company pages read in the last 30 days among these companies, by slug.
   public static async rememberedCompanies(userId: string, slugs: string[], now = new Date()) {
      const found = new Map<string, CompanySnapshotData>()

      if (slugs.length === 0) {
         return found
      }

      const rows = await PrismaService.client.pageSnapshot.findMany({
         where: {
            userId,
            kind: 'COMPANY',
            slug: { in: slugs },
            fetchedAt: { gte: new Date(now.getTime() - COMPANY_REMEMBER_DAYS * DAY_MS) },
         },
         select: {
            slug: true,
            data: true,
         },
      })

      for (const { slug, data } of rows) {
         const snapshot = readCompanySnapshot(data)

         if (snapshot) {
            found.set(slug, snapshot)
         }
      }

      return found
   }

   // Work emails found in the last 90 days among these people, by slug.
   public static async knownEmails(userId: string, slugs: string[], now = new Date()) {
      if (slugs.length === 0) {
         return new Map<string, string>()
      }

      const rows = await PrismaService.client.linkedInProfile.findMany({
         where: {
            userId,
            slug: { in: slugs },
            email: { not: null },
            emailFoundAt: { gte: new Date(now.getTime() - EMAIL_REMEMBER_DAYS * DAY_MS) },
         },
         select: {
            slug: true,
            email: true,
         },
      })

      return new Map(rows.flatMap(({ slug, email }) => (email ? [[slug, email] as const] : [])))
   }
}
