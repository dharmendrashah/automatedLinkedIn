import { z } from 'zod'

import { type Row, count, httpsLink, rows, text } from './snapshotFields'

// A company page or a post the owner chose to read, cut down to what helps judge an account or a conversation.
// Ids and anything not listed here stop at the `...From` functions.

const MAX = {
   about: 2_600,
   post: 3_000,
   specialities: 20,
   breakdown: 8,
}

// The top of an employee breakdown such as [{ function, count }], as { label, count }.
const breakdown = (value: unknown, key: string) =>
   rows(value)
      .flatMap(row => {
         const label = text(row[key], 100)
         const amount = count(row.count)

         return label && amount !== null
            ? [
                 {
                    label,
                    count: amount,
                 },
              ]
            : []
      })
      .slice(0, MAX.breakdown)

const nullable = z.string().nullable()
const amount = z.number().nullable()
const bars = z.array(
   z.object({
      label: z.string(),
      count: z.number(),
   })
)

const companySchema = z.object({
   name: nullable,
   tagline: nullable,
   about: nullable,
   logo: nullable,
   website: nullable,
   founded: amount,
   employees: amount,
   employeeRange: nullable,
   followers: amount,
   industry: nullable,
   headquarters: nullable,
   specialities: z.array(z.string()),
   verified: z.boolean(),
   byFunction: bars,
   byLocation: bars,
   bySkill: bars,
})

export type CompanySnapshotData = z.infer<typeof companySchema>

export const companySnapshotFrom = (row: Row): CompanySnapshotData => {
   const headquarters = [text(row.hqCity), text(row.hqState), text(row.hqCountry)].filter(Boolean).join(', ')

   return {
      name: text(row.companyName),
      tagline: text(row.tagline),
      about: text(row.description, MAX.about),
      logo: httpsLink(row.logo),
      website: httpsLink(row.website),
      founded: count(row.foundedYear),
      employees: count(row.employeeCount),
      employeeRange: text(row.employeeCountRange, 40),
      followers: count(row.followers),
      industry: text(row.industry),
      headquarters: headquarters || null,
      specialities: (Array.isArray(row.specialities) ? row.specialities : [])
         .map(item => text(item, 80))
         .filter((item): item is string => item !== null)
         .slice(0, MAX.specialities),
      verified: row.verified === true,
      byFunction: breakdown(row.employeesByFunction, 'function'),
      byLocation: breakdown(row.employeesByLocation, 'location'),
      bySkill: breakdown(row.employeesBySkill, 'skill'),
   }
}

export const postSchema = z.object({
   text: nullable,
   author: z.object({
      name: nullable,
      url: nullable,
      avatar: nullable,
      headline: nullable,
      followers: amount,
      isCompany: z.boolean(),
   }),
   reactions: amount,
   comments: amount,
   shares: amount,
   postedAt: nullable,
   media: z
      .object({
         url: z.string(),
         type: nullable,
      })
      .nullable(),
   articleUrl: nullable,
   repostNote: nullable,
})

export type PostSnapshotData = z.infer<typeof postSchema>

export const postSnapshotFrom = (row: Row): PostSnapshotData => {
   const media = httpsLink(row.postMediaUrl)

   return {
      text: text(row.postText, MAX.post),
      author: {
         name: text(row.authorName),
         url: httpsLink(row.authorUrl),
         avatar: httpsLink(row.authorAvatar),
         headline: text(row.authorHeadline),
         followers: count(row.authorFollowers),
         isCompany: text(row.authorType)?.toLowerCase() === 'company',
      },
      reactions: count(row.reactions),
      comments: count(row.comments),
      shares: count(row.shares),
      postedAt: text(row.postedDate, 40),
      media: media
         ? {
              url: media,
              type: text(row.postMediaType, 40),
           }
         : null,
      articleUrl: httpsLink(row.articleUrl),
      repostNote: text(row.repostNote),
   }
}

// Snapshots come back from a JSON column; one that does not fit is not shown.
export const readCompanySnapshot = (data: unknown): CompanySnapshotData | null =>
   companySchema.safeParse(data).data ?? null

export const readPostSnapshot = (data: unknown): PostSnapshotData | null => postSchema.safeParse(data).data ?? null
