// The most an account may do in a window (.plan/lead-pipeline-p1-foundations.md). Brain turns each into the day's limit by taking
// a seeded 65 to 80 percent of it; nobody sees the factor.
export const PLATFORM_MAX = {
   // LinkedIn's free-account limits (.docs/linkedin-free-account-limits.md, an estimate).
   invitesPerDay: 20,
   invitesPerWeek: 100,
   notesPerMonth: 5,
   // The owner's reference numbers (2026-11-03).
   firstMessagesPerDay: 20,
   reactionsPerDay: 60,
   commentsPerDay: 20,
   // This project's own number, kept from before (2026-11-03).
   repliesPerDay: 40,
   // What LinkedIn is said to hold; the planner warns at 80 percent and stops at 95 percent.
   pendingInvites: 3000,
} as const

export type LimitKind = Exclude<keyof typeof PLATFORM_MAX, 'pendingInvites'>

// The calendar window each limit counts in.
export const LIMIT_WINDOW = {
   invitesPerDay: 'day',
   invitesPerWeek: 'week',
   notesPerMonth: 'month',
   firstMessagesPerDay: 'day',
   repliesPerDay: 'day',
   reactionsPerDay: 'day',
   commentsPerDay: 'day',
} as const satisfies Record<LimitKind, 'day' | 'week' | 'month'>

// An account may use this share of the maximum, drawn once per account, kind and window.
export const LIMIT_SHARE = {
   min: 0.65,
   max: 0.8,
} as const

export const PENDING_NOTICE_AT = 2400
export const PENDING_PAUSE_AT = 2850
