import { type Prisma } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

type Where = Prisma.PersonWhereInput

// "Works at my companies" (.plan/lead-pipeline-p1-foundations.md): people at a company saved in /companies with one of these labels. A
// person matches by the company's link (`companySlug`) or, with no link, by the company's name. A person with no company never
// matches, and a label with no companies matches nobody.
export const worksAtWhere = async (userId: string, labels: string[]): Promise<Where[]> => {
   if (labels.length === 0) {
      return []
   }

   const companies = await PrismaService.client.linkedInCompany.findMany({
      where: {
         userId,
         archivedAt: null,
         tags: { hasSome: labels },
      },
      select: {
         slug: true,
         name: true,
      },
   })

   if (companies.length === 0) {
      return [{ id: { in: [] } }]
   }

   return [
      {
         OR: [
            { companySlug: { in: companies.map(({ slug }) => slug) } },
            ...companies.flatMap(({ name }) =>
               name
                  ? [
                       {
                          companySlug: null,
                          company: {
                             equals: name,
                             mode: 'insensitive' as const,
                          },
                       },
                    ]
                  : []
            ),
         ],
      },
   ]
}
