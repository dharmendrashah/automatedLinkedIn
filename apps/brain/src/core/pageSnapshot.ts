import { z } from 'zod'

import { type Row, count, httpsLink, linkedInLink, rows, text, webLink } from './snapshotFields'

// A company page or a post the owner chose to read, cut down to what helps judge an account or a conversation.
// Anything not listed here stops at the `...From` functions.

const MAX = {
   about: 2_600,
   post: 3_000,
   specialities: 20,
   breakdown: 15,
   offices: 10,
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
const address = z.object({
   street: nullable,
   city: nullable,
   state: nullable,
   postalCode: nullable,
   country: nullable,
})

// Fields added after the first company reads default, so a snapshot kept before them still opens.
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
   industryCategory: nullable.default(null),
   address: address.nullable().default(null),
   locations: z.array(address).default([]),
   jobsUrl: nullable.default(null),
   ctaUrl: nullable.default(null),
   active: z.boolean().nullable().default(null),
   showcase: z.boolean().default(false),
   linkedinUrl: nullable.default(null),
   companyId: nullable.default(null),
   pageType: nullable.default(null),
   bySchool: bars.default([]),
   byFieldOfStudy: bars.default([]),
   byServiceCategory: bars.default([]),
   // False for a snapshot read before the fields above existed.
   detailed: z.boolean().default(false),
})

export type CompanySnapshotData = z.infer<typeof companySchema>

const addressFrom = (street: unknown, city: unknown, state: unknown, postalCode: unknown, country: unknown) => {
   const parts = {
      street: text(street),
      city: text(city),
      state: text(state),
      postalCode: text(postalCode, 20),
      country: text(country),
   }

   return Object.values(parts).some(Boolean) ? parts : null
}

export const companySnapshotFrom = (row: Row): CompanySnapshotData => {
   const headquarters = [text(row.hqCity), text(row.hqState), text(row.hqCountry)].filter(Boolean).join(', ')
   const website = webLink(row.website)

   return {
      name: text(row.companyName),
      tagline: text(row.tagline),
      about: text(row.description, MAX.about),
      logo: httpsLink(row.logo),
      website,
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
      industryCategory: text(row.industryCategory),
      address: addressFrom(row.hqStreet, row.hqCity, row.hqState, row.hqPostalCode, row.hqCountry),
      locations: rows(row.locations)
         .flatMap(office => {
            const found = addressFrom(office.street, office.city, office.state, office.postalCode, office.country)

            return found ? [found] : []
         })
         .slice(0, MAX.offices),
      jobsUrl: linkedInLink(row.jobsUrl),
      ctaUrl: webLink(row.ctaUrl),
      active: typeof row.activeStatus === 'boolean' ? row.activeStatus : null,
      showcase: typeof row.pageType === 'string' && row.pageType !== 'COMPANY',
      linkedinUrl: linkedInLink(row.linkedinUrl),
      companyId: text(row.companyId, 40),
      pageType: text(row.pageType, 40),
      bySchool: breakdown(row.employeesBySchool, 'school'),
      byFieldOfStudy: breakdown(row.employeesByFieldOfStudy, 'fieldOfStudy'),
      byServiceCategory: breakdown(row.employeesByServiceCategory, 'serviceCategory'),
      detailed: true,
   }
}

// The country of a read: its address, or the last part of an older read's headquarters line.
const countryOf = ({ address, headquarters }: CompanySnapshotData) =>
   address?.country ?? headquarters?.split(',').at(-1)?.trim() ?? null

// What a company read writes onto the company row; undefined leaves the row's value, so a missing one keeps it.
export const companyRowFrom = (snapshot: CompanySnapshotData) => {
   const keep = (value: string | null) => value || undefined

   return {
      name: keep(snapshot.name),
      industry: keep(snapshot.industry),
      website: keep(snapshot.website),
      size: keep(snapshot.employeeRange),
      location: keep(snapshot.headquarters),
      country: keep(countryOf(snapshot)),
   }
}

// The few read fields a row of the Companies table shows beside the company's own columns.
export const companyCardOf = (data: unknown) => {
   const snapshot = readCompanySnapshot(data)

   return snapshot
      ? {
           logo: snapshot.logo,
           tagline: snapshot.tagline,
           employees: snapshot.employees,
           followers: snapshot.followers,
        }
      : null
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
