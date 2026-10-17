import { companySnapshotFrom, readCompanySnapshot } from 'core'

import { PRICE_MICROS } from '@automatedLinkedIn/contracts'

import { ConflictError } from './conflict'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { type PageReader, paidRead } from './paidRead'
import { PrismaService } from './prisma.service'

// One company of the owner's /companies by slug: their own fields, the page they chose to read, and the people in
// their lists who work there.

const PEOPLE_SHOWN = 50

const whereSnapshot = (userId: string, slug: string) => ({
   userId_kind_slug: {
      userId,
      kind: 'COMPANY' as const,
      slug,
   },
})

export class CompanyPageService {
   // null when the company is not in the owner's /companies.
   public static async detail(userId: string, slug: string) {
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

      if (!company) {
         return null
      }

      const page = stored ? readCompanySnapshot(stored.data) : null
      // List members carry the company name as text, so only an exact (case-insensitive) name match counts.
      const names = [...new Set([page?.name, company.name].filter((name): name is string => Boolean(name)))]
      const people =
         names.length === 0
            ? []
            : await PrismaService.client.workflowListMember.findMany({
                 where: {
                    list: { userId },
                    OR: names.map(name => ({
                       company: {
                          equals: name,
                          mode: 'insensitive' as const,
                       },
                    })),
                 },
                 orderBy: [
                    {
                       score: {
                          sort: 'desc',
                          nulls: 'last',
                       },
                    },
                    { createdAt: 'desc' },
                 ],
                 take: PEOPLE_SHOWN,
                 select: {
                    slug: true,
                    name: true,
                    title: true,
                    headline: true,
                    state: true,
                    status: true,
                    score: true,
                    list: { select: { name: true } },
                 },
              })

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
         people,
         readPriceMicros: PRICE_MICROS.companyPage,
      }
   }

   // Pays one company-page read and keeps it (see `paidRead`). null when the company is not the owner's.
   public static async readFull(userId: string, slug: string, reader: PageReader) {
      const known = await CompanyPageService.detail(userId, slug)

      if (!known) {
         return null
      }

      if (known.company.archivedAt) {
         throw new ConflictError('Restore the company first.')
      }

      await paidRead({
         userId,
         kind: 'company',
         slug,
         operation: 'companies',
         params: { companies: [known.url] },
         reader,
         store: async row => {
            const data = companySnapshotFrom(row)

            await PrismaService.client.pageSnapshot.upsert({
               where: whereSnapshot(userId, slug),
               create: {
                  userId,
                  kind: 'COMPANY',
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

      return CompanyPageService.detail(userId, slug)
   }
}
