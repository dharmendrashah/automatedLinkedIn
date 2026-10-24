import { z } from 'zod'

export const PROFILE_CONTRACT_VERSION = 1

// The profile of one LinkedIn account as its own page shows it (.plan/account-profile-page.md). The web app shows it; the task that
// reads it and the brain that keeps it come later and use this same shape. Dates and durations are kept as the text LinkedIn shows,
// and every list carries LinkedIn's own total when the page shows one, because a page lists only the first few.

const shortText = z.string().max(300)
const longText = z.string().max(20_000)

// A picture is only ever an https address; it is never downloaded by the app.
const pictureUrl = z
   .url({ protocol: /^https$/ })
   .max(1000)
   .optional()

// A link out is only ever an https address on linkedin.com.
const linkedInUrl = z
   .url({ protocol: /^https$/ })
   .max(500)
   .refine(
      value => {
         const { hostname } = new URL(value)

         return hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')
      },
      { message: 'Not an address on linkedin.com' }
   )
   .optional()

const count = z.number().int().min(0)

// A list as the page shows it: the first items, and how many there are in all.
const counted = <T extends z.ZodType>(item: T, max: number) =>
   z.strictObject({
      items: z.array(item).max(max),
      total: count.optional(),
   })

// A person, a company, a group, a newsletter or a school shown as a small card.
export const profileEntitySchema = z.strictObject({
   name: z.string().min(1).max(300),
   subtitle: shortText.optional(),
   imageUrl: pictureUrl,
   url: linkedInUrl,
   // "1st", "2nd", "3rd" for a person.
   degree: z.string().max(20).optional(),
   // "954,799 followers".
   followers: shortText.optional(),
})

const postSchema = z.strictObject({
   kind: z.enum(['POST', 'REPOST']),
   author: shortText,
   authorHeadline: shortText.optional(),
   authorImageUrl: pictureUrl,
   when: shortText,
   text: z.string().max(3000),
   imageUrl: pictureUrl,
   reactions: count.optional(),
   comments: count.optional(),
   reposts: count.optional(),
   impressions: count.optional(),
})

const experienceSchema = z.strictObject({
   title: z.string().min(1).max(300),
   company: shortText,
   companyUrl: linkedInUrl,
   logoUrl: pictureUrl,
   employmentType: shortText.optional(),
   dates: shortText.optional(),
   duration: shortText.optional(),
   location: shortText.optional(),
   workMode: shortText.optional(),
   description: longText.optional(),
   skills: z.array(shortText).max(50),
})

const educationSchema = z.strictObject({
   school: z.string().min(1).max(300),
   schoolUrl: linkedInUrl,
   logoUrl: pictureUrl,
   degree: shortText.optional(),
   dates: shortText.optional(),
   description: longText.optional(),
})

const projectSchema = z.strictObject({
   name: z.string().min(1).max(300),
   dates: shortText.optional(),
   description: longText.optional(),
   skills: z.array(shortText).max(50),
   // The line as the page writes it, in its language ("Associated with Sampleworks").
   associatedWith: shortText.optional(),
})

const skillSchema = z.strictObject({
   name: z.string().min(1).max(300),
   endorsements: count.optional(),
})

const languageSchema = z.strictObject({
   name: z.string().min(1).max(300),
   proficiency: shortText.optional(),
})

const recommendationSchema = z.strictObject({
   name: z.string().min(1).max(300),
   degree: z.string().max(20).optional(),
   headline: shortText.optional(),
   imageUrl: pictureUrl,
   url: linkedInUrl,
   // "August 27, 2024, Heiko was senior to Dharmendra but did not manage them directly".
   relationship: shortText.optional(),
   text: longText,
})

export const accountProfileSchema = z.strictObject({
   contract: z.literal(PROFILE_CONTRACT_VERSION),
   captured_at: z.iso.datetime(),
   // The address of the profile itself.
   profileUrl: linkedInUrl,
   name: z.string().min(1).max(300),
   verified: z.boolean(),
   pronouns: z.string().max(40).optional(),
   headline: z.string().max(500).optional(),
   location: shortText.optional(),
   imageUrl: pictureUrl,
   coverUrl: pictureUrl,
   followers: count.optional(),
   // LinkedIn stops counting at "500+", so it is text.
   connections: z.string().max(20).optional(),
   openToWork: z
      .strictObject({
         titles: z.array(shortText).max(20),
         // "Recruiters only" or "All LinkedIn members".
         audience: shortText,
      })
      .optional(),
   about: longText.optional(),
   topSkills: z.array(shortText).max(10),
   services: z.array(shortText).max(50),
   // Private to the account on LinkedIn.
   analytics: z
      .strictObject({
         profileViews: count,
         postImpressions: count,
         searchAppearances: count,
         // "Past 7 days".
         period: shortText.optional(),
      })
      .optional(),
   activity: z
      .strictObject({
         followers: count.optional(),
         posts: z.array(postSchema).max(50),
         comments: z.array(postSchema).max(50),
      })
      .optional(),
   experience: z.array(experienceSchema).max(100),
   education: z.array(educationSchema).max(50),
   projects: counted(projectSchema, 100),
   skills: counted(skillSchema, 500),
   recommendations: z.strictObject({
      received: counted(recommendationSchema, 100),
      given: counted(recommendationSchema, 100),
      // Recommendations waiting for the owner to accept.
      pending: count.optional(),
   }),
   languages: counted(languageSchema, 50),
   interests: z.strictObject({
      topVoices: z.array(profileEntitySchema).max(50),
      companies: z.array(profileEntitySchema).max(50),
      groups: z.array(profileEntitySchema).max(50),
      newsletters: z.array(profileEntitySchema).max(50),
      schools: z.array(profileEntitySchema).max(50),
   }),
   peopleYouMayKnow: z.array(profileEntitySchema).max(50),
   youMightLike: z.array(profileEntitySchema).max(50),
})

export type ProfileEntity = z.infer<typeof profileEntitySchema>
export type AccountProfile = z.infer<typeof accountProfileSchema>
