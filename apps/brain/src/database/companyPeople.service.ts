import { type Prisma } from 'generated/prisma/client'

import { PrismaService } from './prisma.service'

// The My network people who work or worked at a company of /companies (.plan/company-network-people.md), matched each time it is
// asked: by the current company their profile read gave (`companySlug`) or the company name as text, and by any position of
// their saved profile read at it (by its link or name). A position that ended makes them a former employee. A profile in several
// of the owner's clients counts once.

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

// A position of a saved profile read, as the read gave it; `end` is null while they still hold it.
type Role = { slug: string; link: string | null; company: string | null; end: string | null }

// The form a profile read stores a position's company link in (lower-case slug, encoded).
const linkOf = (slug: string) => `https://www.linkedin.com/company/${encodeURIComponent(slug)}`

const rolesAt = (roles: Role[], key: CompanyKey) =>
   roles.filter(role => role.link === linkOf(key.slug) || namesOf(key).includes(clean(role.company ?? '')))

// Every position, in the owner's saved profile reads, at one of these companies.
const rolesOf = (userId: string, keys: CompanyKey[]) => {
   const links = keys.map(({ slug }) => linkOf(slug))
   const names = [...new Set(keys.flatMap(namesOf))]

   return keys.length === 0
      ? Promise.resolve([])
      : PrismaService.client.$queryRaw<Role[]>`
           SELECT s."slug", r->>'companyUrl' AS "link", r->>'company' AS "company", r->>'end' AS "end"
           FROM "PersonSnapshot" s CROSS JOIN LATERAL jsonb_array_elements(s."data"->'experience') r
           WHERE s."userId" = ${userId}
             AND (r->>'companyUrl' = ANY(${links}::text[]) OR lower(trim(r->>'company')) = ANY(${names}::text[]))
           LIMIT ${ROWS_CAP}`
}

const newest = (rows: Row[]) => [...rows].sort((a, b) => b.lastTouchAt.getTime() - a.lastTouchAt.getTime())

// One entry per profile: the most recently touched client's row speaks for it, and every client is named. Current employees
// first; a former one carries when their newest position there ended.
export const byProfile = (rows: Row[], key: CompanyKey, roles: Role[] = []) => {
   const groups = new Map<string, Row[]>()
   const held = new Map<string, Role[]>()

   for (const role of rolesAt(roles, key)) {
      held.set(role.slug, [...(held.get(role.slug) ?? []), role])
   }

   for (const row of rows.filter(item => matches(item, key) || held.has(item.slug))) {
      groups.set(row.slug, [...(groups.get(row.slug) ?? []), row])
   }

   return [...groups.values()]
      .map(group => {
         const sorted = newest(group)
         const [first] = sorted
         const pick = <K extends keyof Row>(field: K) => sorted.find(row => row[field] !== null)?.[field] ?? null
         const positions = held.get(first?.slug ?? '') ?? []
         const current = group.some(row => matches(row, key)) || positions.some(role => role.end === null)

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
            matchedBy:
               group.some(row => row.companySlug === key.slug) || positions.some(role => role.link === linkOf(key.slug))
                  ? ('LINK' as const)
                  : ('NAME' as const),
            relation: current ? ('CURRENT' as const) : ('FORMER' as const),
            // The read lists positions newest first.
            endedOn: current ? null : (positions[0]?.end ?? null),
            priority: Math.max(...group.map(row => row.priority)),
            lastTouchAt: first?.lastTouchAt ?? new Date(0),
         }
      })
      .sort(
         (a, b) =>
            Number(a.relation === 'FORMER') - Number(b.relation === 'FORMER') ||
            Number(a.doNotContact) - Number(b.doNotContact) ||
            b.priority - a.priority ||
            b.lastTouchAt.getTime() - a.lastTouchAt.getTime()
      )
}

const rowsOf = (userId: string, keys: CompanyKey[], roles: Role[], clientId?: string) =>
   keys.length === 0
      ? Promise.resolve([])
      : PrismaService.client.person.findMany({
           where: {
              userId,
              ...(clientId ? { clientId } : {}),
              OR: [...keys.flatMap(whereOf), { slug: { in: [...new Set(roles.map(({ slug }) => slug))] } }],
           },
           orderBy: { lastTouchAt: 'desc' },
           take: ROWS_CAP,
           select: personSelect,
        })

const peopleOf = async (userId: string, keys: CompanyKey[], clientId?: string) => {
   const roles = await rolesOf(userId, keys)

   return {
      roles,
      rows: await rowsOf(userId, keys, roles, clientId),
   }
}

export class CompanyPeopleService {
   // The people at one company, for its drawer; `clientId` narrows to one of the owner's clients.
   public static async atCompany(userId: string, key: CompanyKey, clientId?: string) {
      const { rows, roles } = await peopleOf(userId, [key], clientId)
      const people = byProfile(rows, key, roles)

      return {
         total: people.length,
         people: people.slice(0, PEOPLE_SHOWN),
      }
   }

   // How many people each company has now and had before, with the first few photos, for a page of the companies table.
   public static async counts(userId: string, keys: CompanyKey[]) {
      const { rows, roles } = await peopleOf(userId, keys)

      return new Map(
         keys.map(key => {
            const people = byProfile(rows, key, roles)
            const former = people.filter(({ relation }) => relation === 'FORMER').length

            return [
               key.slug,
               {
                  count: people.length - former,
                  former,
                  first: people.slice(0, PHOTOS_SHOWN).map(({ slug, name, photoUrl, relation }) => ({
                     slug,
                     name,
                     photoUrl,
                     relation,
                  })),
               },
            ]
         })
      )
   }
}
