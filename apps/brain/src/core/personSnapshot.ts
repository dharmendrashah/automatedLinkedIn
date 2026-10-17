import { z } from 'zod'

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

const snapshotSchema = z.object({
   name: nullable,
   headline: nullable,
   location: nullable,
   about: nullable,
   photo: nullable,
   followers: z.number().nullable(),
   connections: z.number().nullable(),
   openToWork: z.boolean(),
   hiring: z.boolean(),
   experience: z.array(
      z.object({
         title: nullable,
         company: nullable,
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
      about: text(row.about, MAX.about),
      photo: photoOf(row.photo),
      followers: count(row.followers),
      connections: count(row.connections),
      openToWork: row.openToWork === true,
      hiring: row.hiring === true,
      experience: rows(row.experience)
         .slice(0, MAX.experience)
         .map(role => ({
            title: text(role.position),
            company: text(role.companyName),
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
