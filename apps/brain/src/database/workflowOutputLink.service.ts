import type { WorkflowItemData } from 'core'

import { PrismaService } from './prisma.service'
import { type OutputLinks, linksOf } from './workflowOutputLinks'

type Row = { item: WorkflowItemData }

// Adds the ids the body needs to open profile and company rows in the app: one query for people and one for companies per page.
export class WorkflowOutputLinkService {
   public static async addLinks<R extends Row>(
      userId: string,
      rows: R[]
   ): Promise<(R & { item: WorkflowItemData & OutputLinks })[]> {
      const slugsOf = (kind: 'profile' | 'company') => [
         ...new Set(rows.flatMap(({ item }) => (item.kind === kind ? [item.slug] : []))),
      ]
      const profiles = slugsOf('profile')
      const companies = slugsOf('company')
      const [people, owned] = await Promise.all([
         profiles.length > 0
            ? PrismaService.client.person.findMany({
                 where: {
                    userId,
                    slug: { in: profiles },
                 },
                 select: {
                    id: true,
                    slug: true,
                 },
              })
            : [],
         companies.length > 0
            ? PrismaService.client.linkedInCompany.findMany({
                 where: {
                    userId,
                    archivedAt: null,
                    slug: { in: companies },
                 },
                 select: { slug: true },
              })
            : [],
      ])
      const found = {
         people: new Map(people.map(({ id, slug }): [string, string] => [slug, id])),
         companies: new Set(owned.map(({ slug }) => slug)),
      }

      return rows.map(row => ({
         ...row,
         item: {
            ...row.item,
            ...linksOf(row.item, found),
         },
      }))
   }
}
