import { PrismaService } from './prisma.service'

type Kind = 'profiles' | 'companies' | 'posts' | 'people'

export type LabelCount = Record<Kind, number> & { label: string; total: number }

const SHOWN = 500

export class LabelService {
   // Every label the owner uses and how often, on each page, most used first. Archived items do not count. People are list members
   // and My network's people.
   public static async list(userId: string): Promise<LabelCount[]> {
      const rows = await PrismaService.client.$queryRaw<{ label: string; kind: Kind; count: number }[]>`
         SELECT label, kind, count(*)::int AS count FROM (
            SELECT unnest(tags) AS label, 'profiles' AS kind FROM "LinkedInProfile"
               WHERE "userId" = ${userId} AND "archivedAt" IS NULL
            UNION ALL
            SELECT unnest(tags), 'companies' FROM "LinkedInCompany" WHERE "userId" = ${userId} AND "archivedAt" IS NULL
            UNION ALL
            SELECT unnest(tags), 'posts' FROM "LinkedInPost" WHERE "userId" = ${userId} AND "archivedAt" IS NULL
            UNION ALL
            SELECT unnest(member.tags), 'people' FROM "WorkflowListMember" AS member
               JOIN "WorkflowList" AS list ON list.id = member."listId"
               WHERE list."userId" = ${userId}
            UNION ALL
            SELECT unnest(labels), 'people' FROM "Person" WHERE "userId" = ${userId}
         ) AS labelled
         GROUP BY label, kind`
      const byLabel = new Map<string, LabelCount>()

      for (const { label, kind, count } of rows) {
         const known = byLabel.get(label) ?? {
            label,
            total: 0,
            profiles: 0,
            companies: 0,
            posts: 0,
            people: 0,
         }

         known[kind] = count
         known.total += count
         byLabel.set(label, known)
      }

      return [...byLabel.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)).slice(0, SHOWN)
   }
}
