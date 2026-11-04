import { PrismaService } from './prisma.service'

// What the ranking blocks ask of My network about companies (.plan/lead-pipeline-p7-ranking.md): who else works at a company and when the
// owner's accounts last reached them, and which companies the owner labelled.

// A person at a company, by what the owner's accounts did with them.
export type Colleague = { slug: string; lastContactAt: Date | null; lastReplyAt: Date | null }

const latest = (...dates: Array<Date | null>) =>
   dates.reduce<Date | null>((best, date) => (date && (!best || date > best) ? date : best), null)

export class ColleaguesService {
   // The people of My network at each of these companies (by name, any case): when an account last invited, wrote to or engaged with
   // them, and when they last wrote back. A company nobody there is known for has no entry.
   public static async ofCompanies(userId: string, names: string[]) {
      const wanted = [...new Set(names.map(name => name.trim().toLowerCase()).filter(Boolean))]
      const byCompany = new Map<string, Colleague[]>()

      if (wanted.length === 0) {
         return byCompany
      }

      const people = await PrismaService.client.person.findMany({
         where: {
            userId,
            OR: wanted.map(name => ({
               company: {
                  equals: name,
                  mode: 'insensitive' as const,
               },
            })),
         },
         select: {
            slug: true,
            company: true,
            invitedAt: true,
            lastSentAt: true,
            lastEngagedAt: true,
            lastReceivedAt: true,
         },
      })

      for (const { slug, company, invitedAt, lastSentAt, lastEngagedAt, lastReceivedAt } of people) {
         const key = (company ?? '').trim().toLowerCase()

         byCompany.set(key, [
            ...(byCompany.get(key) ?? []),
            {
               slug,
               lastContactAt: latest(invitedAt, lastSentAt, lastEngagedAt),
               lastReplyAt: lastReceivedAt,
            },
         ])
      }

      return byCompany
   }

   // The names, lower case, of the owner's companies that carry a label.
   public static async labelled(userId: string, label: string) {
      const rows = await PrismaService.client.linkedInCompany.findMany({
         where: {
            userId,
            archivedAt: null,
            tags: { has: label },
         },
         select: { name: true },
      })

      return new Set(rows.flatMap(({ name }) => (name ? [name.trim().toLowerCase()] : [])))
   }
}
