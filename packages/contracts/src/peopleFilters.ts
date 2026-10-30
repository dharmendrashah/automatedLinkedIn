import { z } from 'zod'

// The filters of My network (.plan/network-filters.md), one schema for brain's `people.list` and `people.export`. The page keeps
// its own copy with local dates (`apps/body/src/components/my-network/filters/model.ts`), and a test keeps the two equal.

export const PEOPLE_FILTER_LIMITS = {
   text: 100,
   values: 20,
} as const

export const PERSON_INVITE_STATES = ['NONE', 'QUEUED', 'PENDING', 'ACCEPTED', 'ENDED'] as const
export const PERSON_STATUSES = ['NEW', 'CONTACTED', 'REPLIED', 'NOT_INTERESTED', 'DONE'] as const

const text = z.string().trim().min(1).max(PEOPLE_FILTER_LIMITS.text)
const values = <T extends z.ZodType>(value: T) => z.array(value).max(PEOPLE_FILTER_LIMITS.values).default([])

// An exact instant; the page turns the owner's local day and time into one.
const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value))

export const dateRangeSchema = z
   .strictObject({
      from: instant.optional(),
      to: instant.optional(),
   })
   .refine(({ from, to }) => !from || !to || from <= to, 'The range ends before it starts.')

export const peopleFiltersSchema = z
   .strictObject({
      name: text.optional(),
      companies: values(text),
      // The current job title from a profile read.
      title: text.optional(),
      countries: values(text),
      premium: z.boolean().optional(),
      connection: z.enum(['CONNECTED', 'NOT_CONNECTED']).optional(),
      // Connected to this account of the client.
      connectedTo: z.string().min(1).max(100).optional(),
      connectedAt: dateRangeSchema.optional(),
      invites: values(z.enum(PERSON_INVITE_STATES)),
      lastSent: dateRangeSchema.optional(),
      lastReceived: dateRangeSchema.optional(),
      neverMessaged: z.boolean().default(false),
      replyWaiting: z.boolean().default(false),
      lastTouch: dateRangeSchema.optional(),
      firstSeen: dateRangeSchema.optional(),
      labels: values(text.toLowerCase()),
      labelsMode: z.enum(['any', 'all']).default('any'),
      noLabels: z.boolean().default(false),
      statuses: values(z.enum(PERSON_STATUSES)),
      profileRead: z.boolean().optional(),
   })
   .refine(
      filters => filters.connection !== 'NOT_CONNECTED' || (!filters.connectedAt && !filters.connectedTo),
      'Connected dates and an account only go with Connected.'
   )

export type PeopleFiltersInput = z.input<typeof peopleFiltersSchema>
export type PeopleFilters = z.output<typeof peopleFiltersSchema>
