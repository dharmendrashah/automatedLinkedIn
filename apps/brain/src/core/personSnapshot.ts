import { z } from 'zod'

import { parseLinkedInUrl } from './linkedInUrl'
import { type Row, count, httpsLink as photoOf, rows, text } from './snapshotFields'

// The full profile an owner chose to read, cut down to what helps judge a lead. Ids, contact details and anything
// not listed here stop at `snapshotFrom`.

const MAX = {
   about: 2_600,
   description: 600,
   experience: 15,
   education: 10,
   skills: 30,
}

// Dates come as text or as { year, month }.
const dateOf = (value: unknown) => {
   if (typeof value === 'string' || typeof value === 'number') {
      return text(String(value), 40)
   }

   if (typeof value === 'object' && value !== null && 'year' in value) {
      const { year, month } = value as { year?: unknown; month?: unknown }

      return count(year) === null ? null : count(month) ? `${String(month)}/${String(year)}` : String(year)
   }

   return null
}

const nullable = z.string().nullable()

const flagOf = (value: unknown) => (typeof value === 'boolean' ? value : null)

// A position's company as its canonical LinkedIn link (lower-case slug), or null when it is not one.
const companyLinkOf = (value: unknown) => {
   const raw = text(value, 1_000)
   const slug = raw ? parseLinkedInUrl(raw, 'company')?.slug.toLowerCase() : undefined

   return slug ? `https://www.linkedin.com/company/${encodeURIComponent(slug)}` : null
}

const snapshotSchema = z.object({
   name: nullable,
   headline: nullable,
   location: nullable,
   // Missing from reads made before 2026-10-30.
   country: nullable.optional(),
   about: nullable,
   photo: nullable,
   // Missing from reads made before 2026-10-31, like `premium` and a position's `companyUrl`.
   cover: nullable.optional(),
   premium: z.boolean().nullable().optional(),
   // Missing from reads made before 2026-11-01.
   verified: z.boolean().nullable().optional(),
   creator: z.boolean().nullable().optional(),
   followers: z.number().nullable(),
   connections: z.number().nullable(),
   openToWork: z.boolean(),
   hiring: z.boolean(),
   experience: z.array(
      z.object({
         title: nullable,
         company: nullable,
         companyUrl: nullable.optional(),
         location: nullable,
         start: nullable,
         end: nullable,
         description: nullable,
      })
   ),
   education: z.array(
      z.object({
         school: nullable,
         degree: nullable,
         field: nullable,
         start: nullable,
         end: nullable,
      })
   ),
   skills: z.array(z.string()),
})

export type PersonSnapshotData = z.infer<typeof snapshotSchema>

export const snapshotFrom = (row: Row): PersonSnapshotData => {
   const name = [text(row.firstName), text(row.lastName)].filter(Boolean).join(' ')
   const location = [text(row.city), text(row.state), text(row.country)].filter(Boolean).join(', ')

   return {
      name: name || null,
      headline: text(row.headline),
      location: location || null,
      country: text(row.country),
      about: text(row.about, MAX.about),
      photo: photoOf(row.photo),
      cover: photoOf(row.coverPhoto),
      premium: flagOf(row.premium),
      verified: flagOf(row.verified),
      creator: flagOf(row.creator),
      followers: count(row.followers),
      connections: count(row.connections),
      openToWork: row.openToWork === true,
      hiring: row.hiring === true,
      experience: rows(row.experience)
         .slice(0, MAX.experience)
         .map(role => ({
            title: text(role.position),
            company: text(role.companyName),
            companyUrl: companyLinkOf(role.companyLinkedinUrl),
            location: text(role.location),
            start: dateOf(role.startDate),
            end: dateOf(role.endDate),
            description: text(role.description, MAX.description),
         })),
      education: rows(row.education)
         .slice(0, MAX.education)
         .map(school => ({
            school: text(school.schoolName),
            degree: text(school.degree),
            field: text(school.fieldOfStudy),
            start: dateOf(school.startDate),
            end: dateOf(school.endDate),
         })),
      skills: (Array.isArray(row.skills) ? row.skills : [])
         .map(skill => text(typeof skill === 'object' && skill !== null && 'name' in skill ? skill.name : skill, 80))
         .filter((skill): skill is string => skill !== null)
         .slice(0, MAX.skills),
   }
}

// Snapshots come back from a JSON column; one that does not fit is not shown.
export const readSnapshot = (data: unknown): PersonSnapshotData | null => snapshotSchema.safeParse(data).data ?? null

// Every LinkedIn company of the experience, once each, newest position first.
export const companiesOf = (snapshot: PersonSnapshotData) => {
   const found = new Map<string, string | null>()

   for (const role of snapshot.experience) {
      const slug = role.companyUrl ? parseLinkedInUrl(role.companyUrl, 'company')?.slug.toLowerCase() : undefined

      if (slug && !found.has(slug)) {
         found.set(slug, role.company)
      }
   }

   return [...found].map(([slug, name]) => ({
      slug,
      name,
   }))
}

// What My network's filters read from a profile read: the current position (one that has not ended, else the newest) and the
// country (an older read only has the joined location, whose last part is the country when there are several).
export const profileFacts = (snapshot: PersonSnapshotData) => {
   const role = snapshot.experience.find(({ end }) => end === null) ?? snapshot.experience[0]
   const places = (snapshot.location ?? '').split(',').map(place => place.trim())

   return {
      name: snapshot.name,
      headline: snapshot.headline,
      photo: snapshot.photo,
      title: role?.title ?? null,
      company: role?.company ?? null,
      companySlug: role?.companyUrl ? (parseLinkedInUrl(role.companyUrl, 'company')?.slug ?? null) : null,
      country: snapshot.country ?? (places.length > 1 ? (places.at(-1) ?? null) : null),
      premium: snapshot.premium ?? null,
      skills: snapshot.skills,
   }
}
