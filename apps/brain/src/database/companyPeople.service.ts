import { type Prisma } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

// The My network people who work at a company of /companies (.plan/company-network-people.md), matched each time it is asked:
// by the company link their profile read gave (`companySlug`), or by the company name as text. A profile in several of the
// owner's clients counts once.

const PEOPLE_SHOWN = 50
const PHOTOS_SHOWN = 3
// Rows read for one question at most; a company with more people than this is counted short.
const ROWS_CAP = 5_000

export type CompanyKey = { slug: string; names: string[] }

const personSelect = {
   id: true,
   slug: true,
   name: true,
   headline: true,
   title: true,
   company: true,
   companySlug: true,
   photoUrl: true,
   status: true,
   doNotContact: true,
   reasonText: true,
   reasonUrl: true,
   reasonAt: true,
   priority: true,
   lastTouchAt: true,
   client: { select: { name: true } },
} satisfies Prisma.PersonSelect

type Row = Prisma.PersonGetPayload<{ select: typeof personSelect }>

const clean = (name: string) => name.trim().toLowerCase()

const namesOf = (key: CompanyKey) => [...new Set(key.names.map(clean).filter(Boolean))]

const whereOf = (key: CompanyKey): Prisma.PersonWhereInput[] => [
   { companySlug: key.slug },
   ...namesOf(key).map(name => ({
      company: {
         equals: name,
         mode: 'insensitive' as const,
      },
   })),
]

const matches = (row: Row, key: CompanyKey) =>
   row.companySlug === key.slug || namesOf(key).includes(clean(row.company ?? ''))

const newest = (rows: Row[]) => [...rows].sort((a, b) => b.lastTouchAt.getTime() - a.lastTouchAt.getTime())

// One entry per profile: the most recently touched client's row speaks for it, and every client is named.
export const byProfile = (rows: Row[], key: CompanyKey) => {
   const groups = new Map<string, Row[]>()

   for (const row of rows.filter(item => matches(item, key))) {
      groups.set(row.slug, [...(groups.get(row.slug) ?? []), row])
   }

   return [...groups.values()]
      .map(group => {
         const sorted = newest(group)
         const [first] = sorted
         const pick = <K extends keyof Row>(field: K) => sorted.find(row => row[field] !== null)?.[field] ?? null

         return {
            id: first?.id ?? '',
            slug: first?.slug ?? '',
            name: pick('name'),
            headline: pick('headline'),
            title: pick('title'),
            photoUrl: pick('photoUrl'),
            status: first?.status ?? 'NEW',
            doNotContact: group.some(row => row.doNotContact),
            reasonText: first?.reasonText ?? null,
            reasonUrl: first?.reasonUrl ?? null,
            reasonAt: first?.reasonAt ?? null,
            clients: [...new Set(sorted.map(row => row.client.name))],
            matchedBy: group.some(row => row.companySlug === key.slug) ? ('LINK' as const) : ('NAME' as const),
            priority: Math.max(...group.map(row => row.priority)),
            lastTouchAt: first?.lastTouchAt ?? new Date(0),
         }
      })
      .sort(
         (a, b) =>
            Number(a.doNotContact) - Number(b.doNotContact) ||
            b.priority - a.priority ||
            b.lastTouchAt.getTime() - a.lastTouchAt.getTime()
      )
}

const rowsOf = (userId: string, keys: CompanyKey[], clientId?: string) =>
   keys.length === 0
      ? Promise.resolve([])
      : PrismaService.client.person.findMany({
           where: {
              userId,
              ...(clientId ? { clientId } : {}),
              OR: keys.flatMap(whereOf),
           },
           orderBy: { lastTouchAt: 'desc' },
           take: ROWS_CAP,
           select: personSelect,
        })

export class CompanyPeopleService {
   // The people at one company, for its drawer; `clientId` narrows to one of the owner's clients.
   public static async atCompany(userId: string, key: CompanyKey, clientId?: string) {
      const people = byProfile(await rowsOf(userId, [key], clientId), key)

      return {
         total: people.length,
         people: people.slice(0, PEOPLE_SHOWN),
      }
   }

   // How many people each company has, with the first few photos, for a page of the companies table.
   public static async counts(userId: string, keys: CompanyKey[]) {
      const rows = await rowsOf(userId, keys)

      return new Map(
         keys.map(key => {
            const people = byProfile(rows, key)

            return [
               key.slug,
               {
                  count: people.length,
                  first: people.slice(0, PHOTOS_SHOWN).map(({ slug, name, photoUrl }) => ({
                     slug,
                     name,
                     photoUrl,
                  })),
               },
            ]
         })
      )
   }
}
