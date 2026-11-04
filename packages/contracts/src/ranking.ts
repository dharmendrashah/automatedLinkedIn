import { z } from 'zod'

// Ranking and routing (.plan/lead-pipeline-p7-ranking.md): the signals a person or a company shows, how fast each one fades, the weights of
// the four parts of a person's score, and the tier lines. Pure, so brain scores with it and the editor shows it.

export const SIGNAL_TYPES = [
   'asked',
   'posted',
   'commented',
   'reacted',
   'engagedOurPost',
   'viewed',
   'requested',
   'accepted',
   'replied',
   'notNow',
   'jobchange',
   'hiringCompany',
   'funding',
   'competitor',
   'employee',
   'shared',
   'mutual',
] as const

export type SignalType = (typeof SIGNAL_TYPES)[number]

export const COMPANY_SIGNAL_TYPES = ['hiring', 'ads', 'funding', 'growth', 'tool'] as const

export type CompanySignalType = (typeof COMPANY_SIGNAL_TYPES)[number]

export const SIGNAL_LABELS: Record<SignalType, string> = {
   asked: 'Asked for a tool',
   posted: 'Posted about the problem',
   commented: 'Commented on a post',
   reacted: 'Reacted to a post',
   engagedOurPost: 'Engaged with our posts',
   viewed: 'Visited our profile',
   requested: 'Asked to connect with us',
   accepted: 'Accepted our invite',
   replied: 'Replied to us',
   notNow: 'Said not now',
   jobchange: 'New role in an ideal title',
   hiringCompany: 'Their company is hiring',
   funding: 'Their company raised money',
   competitor: 'Works at a competitor',
   employee: 'Works at a target company',
   shared: 'Shares a school, employer or group',
   mutual: 'Has mutual connections',
}

// Points a signal gives while fresh and how many days until half of them are gone. 0 gives nothing (it is kept for the reader and the rules).
export type SignalWeight = { points: number; halfLifeDays: number }

export const DEFAULT_SIGNALS: Record<SignalType, SignalWeight> = {
   asked: {
      points: 20,
      halfLifeDays: 14,
   },
   requested: {
      points: 20,
      halfLifeDays: 30,
   },
   posted: {
      points: 15,
      halfLifeDays: 30,
   },
   engagedOurPost: {
      points: 15,
      halfLifeDays: 30,
   },
   viewed: {
      points: 12,
      halfLifeDays: 14,
   },
   jobchange: {
      points: 10,
      halfLifeDays: 90,
   },
   commented: {
      points: 8,
      halfLifeDays: 30,
   },
   hiringCompany: {
      points: 8,
      halfLifeDays: 45,
   },
   funding: {
      points: 6,
      halfLifeDays: 60,
   },
   accepted: {
      points: 6,
      halfLifeDays: 30,
   },
   reacted: {
      points: 4,
      halfLifeDays: 30,
   },
   employee: {
      points: 3,
      halfLifeDays: 90,
   },
   replied: {
      points: 0,
      halfLifeDays: 30,
   },
   notNow: {
      points: 0,
      halfLifeDays: 30,
   },
   competitor: {
      points: 0,
      halfLifeDays: 90,
   },
   shared: {
      points: 4,
      halfLifeDays: 90,
   },
   mutual: {
      points: 2,
      halfLifeDays: 90,
   },
}

export const DEFAULT_COMPANY_SIGNALS: Record<CompanySignalType, SignalWeight> = {
   hiring: {
      points: 15,
      halfLifeDays: 45,
   },
   ads: {
      points: 10,
      halfLifeDays: 30,
   },
   funding: {
      points: 12,
      halfLifeDays: 60,
   },
   growth: {
      points: 8,
      halfLifeDays: 90,
   },
   tool: {
      points: 8,
      halfLifeDays: 90,
   },
}

export const PARTS = ['fit', 'intent', 'reach', 'relationship'] as const

export type Part = (typeof PARTS)[number]

export type Parts = Record<Part, number>

export type RankModel = {
   parts: Parts
   signals: Record<SignalType, SignalWeight>
   companySignals: Record<CompanySignalType, SignalWeight>
}

export const MODEL_IDS = ['balanced', 'fitFirst', 'intentFirst'] as const

export type ModelId = (typeof MODEL_IDS)[number]

export const MODEL_LABELS: Record<ModelId, string> = {
   balanced: 'Balanced',
   fitFirst: 'Fit first',
   intentFirst: 'Intent first',
}

const PART_SETS: Record<ModelId, Parts> = {
   balanced: {
      fit: 50,
      intent: 30,
      reach: 10,
      relationship: 10,
   },
   fitFirst: {
      fit: 65,
      intent: 20,
      reach: 8,
      relationship: 7,
   },
   intentFirst: {
      fit: 35,
      intent: 45,
      reach: 10,
      relationship: 10,
   },
}

// The built-in models: the same signal table, different parts.
export const modelOf = (id: ModelId): RankModel => ({
   parts: PART_SETS[id],
   signals: DEFAULT_SIGNALS,
   companySignals: DEFAULT_COMPANY_SIGNALS,
})

export const partsError = (parts: Parts) =>
   PARTS.reduce((sum, part) => sum + parts[part], 0) === 100 ? null : 'Parts must add up to 100.'

export const TIERS = ['A', 'B', 'C', 'D'] as const

export type Tier = (typeof TIERS)[number]

export const tierLinesSchema = z
   .object({
      a: z.number().int().min(1).max(100).default(80),
      b: z.number().int().min(1).max(100).default(60),
      c: z.number().int().min(1).max(100).default(40),
   })
   .refine(({ a, b, c }) => a > b && b > c, 'Tier lines must go down: A above B above C.')

export type TierLines = z.infer<typeof tierLinesSchema>

export const tierOf = (score: number, { a, b, c }: TierLines): Tier =>
   score >= a ? 'A' : score >= b ? 'B' : score >= c ? 'C' : 'D'

// Signals fade: how many of a signal's points are left after `days`. A future date is ignored (no points), never more than the full points.
export const fadeFactor = (days: number, halfLifeDays: number) =>
   days < 0 || halfLifeDays <= 0 ? 0 : 0.5 ** (days / halfLifeDays)

// "Slow" doubles how long a signal lasts, "Fast" halves it.
export const FADE_SPEEDS = {
   slow: 2,
   normal: 1,
   fast: 0.5,
} as const

export type FadeSpeed = keyof typeof FADE_SPEEDS
