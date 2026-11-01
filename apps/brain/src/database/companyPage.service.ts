import { readCompanySnapshot } from 'core'

import { type Prisma } from 'generated/prisma/client'

import { PRICE_MICROS } from '@automatedLinkedIn/contracts'

import { CompanyPeopleService } from './companyPeople.service'
import { ConflictError } from './conflict'
import { DataReadService, RECENT_READ_MS } from './dataRead.service'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { PrismaService } from './prisma.service'

// One company of the owner's /companies by slug: their own fields, the page they chose to read, and the My network people who
// work there.

const readOf = (userId: string, slug: string, url: string) => ({
   userId,
   kind: 'COMPANY' as const,
   slug,
   operation: 'companies',
   params: { companies: [url] },
})

const whereSnapshot = (userId: string, slug: string) => ({
   userId_kind_slug: {
      userId,
      kind: 'COMPANY' as const,
      slug,
   },
})

// The owner's company and its stored read; null when it is not in their /companies.
const companyOf = async (userId: string, slug: string) => {
   const [company, stored] = await Promise.all([
      LinkedInCompanyService.bySlug(userId, slug),
      PrismaService.client.pageSnapshot.findUnique({
         where: whereSnapshot(userId, slug),
         select: {
            data: true,
            fetchedAt: true,
         },
      }),
   ])

   return company
      ? {
           company,
           stored,
           page: stored ? readCompanySnapshot(stored.data) : null,
        }
      : null
}

export class CompanyPageService {
   // null when the company is not in the owner's /companies.
   public static async detail(userId: string, slug: string) {
      const found = await companyOf(userId, slug)

      if (!found) {
         return null
      }

      const { company, stored, page } = found

      return {
         slug,
         url: company.url,
         company,
         snapshot:
            page && stored
               ? {
                    ...page,
                    fetchedAt: stored.fetchedAt,
                 }
               : null,
         read: await DataReadService.latest(userId, 'COMPANY', slug),
         readPriceMicros: PRICE_MICROS.companyPage,
      }
   }

   // The My network people who work at the company, matched by its link or by its saved or read name. null when it is not the owner's.
   public static async people(userId: string, slug: string, clientId?: string) {
      const found = await companyOf(userId, slug)

      return found
         ? CompanyPeopleService.atCompany(
              userId,
              {
                 slug,
                 names: [found.page?.name, found.company.name].filter((name): name is string => Boolean(name)),
              },
              clientId
           )
         : null
   }

   // Queues one company-page read for the worker. null when the company is not the owner's.
   public static async readFull(userId: string, slug: string) {
      const known = await CompanyPageService.detail(userId, slug)

      if (!known) {
         return null
      }

      if (known.company.archivedAt) {
         throw new ConflictError('Restore the company first.')
      }

      await DataReadService.queue(readOf(userId, slug, known.url))

      return CompanyPageService.detail(userId, slug)
   }

   // The companies of these read (and paid for) in the last 30 days, which an import or a bulk read leaves alone.
   public static readRecently(userId: string, slugs: string[], now = new Date()) {
      return DataReadService.paidSince(userId, 'COMPANY', slugs, new Date(now.getTime() - RECENT_READ_MS))
   }

   // One read each for the owner's live companies matched, except those read in the last 30 days (.plan/companies-import-csv.md).
   // A read refused now (the balance is low) is counted, not failed.
   public static async readMany(userId: string, which: Prisma.LinkedInCompanyWhereInput) {
      const companies = await PrismaService.client.linkedInCompany.findMany({
         where: {
            ...which,
            userId,
            archivedAt: null,
         },
         select: {
            slug: true,
            url: true,
         },
      })
      const recent = await CompanyPageService.readRecently(
         userId,
         companies.map(({ slug }) => slug)
      )
      const queued = await DataReadService.queueEach(
         companies.filter(({ slug }) => !recent.has(slug)).map(({ slug, url }) => readOf(userId, slug, url))
      )

      return {
         ...queued,
         readRecently: recent.size,
      }
   }
}
