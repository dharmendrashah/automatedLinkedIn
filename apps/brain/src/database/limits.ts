import { createHash } from 'node:crypto'

import {
   LIMIT_SHARE,
   LIMIT_WINDOW,
   type LimitKind,
   PENDING_NOTICE_AT,
   PENDING_PAUSE_AT,
   PLATFORM_MAX,
} from '@automatedLinkedIn/contracts'

import { dayKey } from './browseAllowance'

// The limit of one account for one kind of act (.plan/lead-pipeline-p1-foundations.md): a seeded share of the platform maximum,
// so every process and every retry sees the same number and no table is needed.

const DAY_MS = 24 * 60 * 60 * 1000

const pad = (value: number) => String(value).padStart(2, '0')

const isoWeekKey = (day: string) => {
   const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
   const thursday = new Date(Date.UTC(year, month - 1, date))

   // The ISO week belongs to the year of its Thursday.
   thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3)

   const weekYear = thursday.getUTCFullYear()
   const firstThursday = new Date(Date.UTC(weekYear, 0, 4))

   firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3)

   const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS))

   return `${weekYear}-W${pad(week)}`
}

// The calendar window a moment falls in, in the account's zone: a day, an ISO week or a month.
export const limitWindowKey = (window: 'day' | 'week' | 'month', now: Date, timeZone: string) => {
   const day = dayKey(now, timeZone)

   if (window === 'day') {
      return day
   }

   return window === 'week' ? isoWeekKey(day) : day.slice(0, 7)
}

export const limitOf = (kind: LimitKind, accountId: string, now: Date, timeZone: string) => {
   const window = limitWindowKey(LIMIT_WINDOW[kind], now, timeZone)
   const seed = createHash('sha256').update(`${kind}|${accountId}|${window}`).digest().readUInt32BE(0) / 2 ** 32
   const share = LIMIT_SHARE.min + (LIMIT_SHARE.max - LIMIT_SHARE.min) * seed

   return Math.max(1, Math.round(PLATFORM_MAX[kind] * share))
}

export type PendingLevel = 'ok' | 'notice' | 'paused'

// How full an account's pending invites are: a notice at 2,400, new invites paused at 2,850 (of about 3,000, an estimate).
export const pendingLevel = (count: number): PendingLevel =>
   count >= PENDING_PAUSE_AT ? 'paused' : count >= PENDING_NOTICE_AT ? 'notice' : 'ok'
