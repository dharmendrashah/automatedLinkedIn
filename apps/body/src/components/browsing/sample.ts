import { type AccountStatus } from '../accounts/types'
import {
   type AccountBrowse,
   type BrowseMode,
   type BrowseState,
   type DaySession,
   type DayUsage,
   type UseMixPart,
   type WorkingHours,
} from './types'

import { clock } from './format'
import { lastDays, weekdayOf } from './heatmap-grid'
import { limitSecondsOf } from './modes'

// Invented browsing data to look at the screens before brain serves the real numbers (.plan/account-browsing-ui.md).
// `?browse=busy|sparse|empty|over` picks the shape. The data is built from the account id, so it is the same on every visit.

export const SAMPLE_KINDS = ['busy', 'sparse', 'empty', 'over'] as const

export type SampleKind = (typeof SAMPLE_KINDS)[number]

export const sampleKindOf = (value: string | null): SampleKind | null =>
   SAMPLE_KINDS.find(kind => kind === value) ?? null

export type SampleAccount = {
   id: string
   email: string
   status: AccountStatus
}

export type Override = Partial<Pick<AccountBrowse, 'mode' | 'hours' | 'clientLabel'>>

const HISTORY_DAYS = 730
const OFFICE_START = 9 * 60
const OFFICE_END = 18 * 60
const SECONDS_PER_VIEW = 90
const MODE_CYCLE: BrowseMode[] = ['SAFE', 'SAFE', 'MODERATE', 'SAFE', 'AGGRESSIVE', 'MODERATE']
const CLIENTS = ['Acme Partners', 'Northwind Labs', null, 'Acme Partners', 'Brightside', null]
const ZONES = ['Asia/Kolkata', 'Europe/London', 'America/New_York']

const hash = (text: string) => {
   let value = 2166136261

   for (const char of text) {
      value = Math.imul(value ^ char.charCodeAt(0), 16777619)
   }

   return value >>> 0
}

const seeded = (seed: number) => {
   let state = seed

   return () => {
      state = (state + 0x6d2b79f5) | 0

      let next = Math.imul(state ^ (state >>> 15), 1 | state)

      next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next

      return ((next ^ (next >>> 14)) >>> 0) / 4294967296
   }
}

const pad = (value: number) => String(value).padStart(2, '0')

export const dayOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const baseOf = (id: string) => {
   const value = hash(id)

   return {
      mode: MODE_CYCLE[value % MODE_CYCLE.length] ?? 'SAFE',
      clientLabel: CLIENTS[(value >>> 3) % CLIENTS.length] ?? null,
      timeZone: ZONES[(value >>> 6) % ZONES.length] ?? 'UTC',
      // One in four accounts has used the whole day by now, to show a full account.
      full: value % 4 === 0,
      waits: value % 3 === 0,
   }
}

const officeHours = (timeZone: string): WorkingHours => ({
   days: [1, 2, 3, 4, 5],
   startMinute: OFFICE_START,
   endMinute: OFFICE_END,
   timeZone,
})

const clamp = (value: number) => Math.min(1, Math.max(0, value))

// Two years of days with something browsed, today included as far as the clock has got.
export const sampleDays = (kind: SampleKind, id: string, now: Date): DayUsage[] => {
   if (kind === 'empty') {
      return []
   }

   const { mode, full } = baseOf(id)
   const limitSeconds = limitSecondsOf(mode)
   const random = seeded(hash(`${kind}:${id}`))
   const today = dayOf(now)
   const elapsed = clamp((now.getHours() * 60 + now.getMinutes() - OFFICE_START) / (OFFICE_END - OFFICE_START))

   return lastDays(today, HISTORY_DAYS).flatMap(day => {
      const working = weekdayOf(day) <= 5
      const roll = random()
      const size = random()
      let share = 0

      if (kind === 'sparse') {
         share = working && roll < 0.3 ? 0.1 + size * 0.4 : 0
      } else if (roll >= (working ? 0.08 : 0.94)) {
         share = working ? 0.5 + size * 0.5 : 0.1 + size * 0.2
      }

      if (kind === 'over' && working && roll > 0.86) {
         share = 1.05 + size * 0.25
      }

      if (day === today) {
         share = working && share > 0 ? (full ? 1 : share * elapsed) : 0
      }

      const seconds = Math.round(share * limitSeconds)

      return seconds > 0 ? [{ day, seconds, sessions: Math.max(1, Math.round(seconds / 540)), limitSeconds }] : []
   })
}

const idleWorkingDays = (days: DayUsage[], hours: WorkingHours, today: string) => {
   const used = new Map(days.map(item => [item.day, item.seconds]))
   let count = 0

   for (const day of lastDays(today, 60).reverse()) {
      if (!hours.days.includes(weekdayOf(day))) {
         continue
      }

      if ((used.get(day) ?? 0) > 0) {
         break
      }

      count += 1
   }

   return count
}

const stateOf = (
   status: AccountStatus,
   usedSeconds: number,
   limitSeconds: number,
   hours: WorkingHours,
   now: Date,
   waits: boolean
): { state: BrowseState; nextAt: string | null } => {
   const minute = now.getHours() * 60 + now.getMinutes()
   const tomorrow = `tomorrow at ${clock(hours.startMinute)}`
   const open = hours.days.includes(weekdayOf(dayOf(now))) && minute >= hours.startMinute && minute < hours.endMinute

   if (status !== 'ACTIVE') {
      return { state: 'NOT_BROWSING', nextAt: null }
   }

   if (!open) {
      return { state: 'OUTSIDE_HOURS', nextAt: minute < hours.startMinute ? clock(hours.startMinute) : tomorrow }
   }

   if (usedSeconds >= limitSeconds) {
      return { state: 'DAY_FULL', nextAt: tomorrow }
   }

   return waits ? { state: 'WAITING_FOR_SLOT', nextAt: clock(minute + 14) } : { state: 'OPEN', nextAt: null }
}

export const buildBrowse = (
   kind: SampleKind,
   account: SampleAccount,
   now: Date,
   override?: Override
): AccountBrowse => {
   const base = baseOf(account.id)
   const mode = override?.mode ?? base.mode
   const hours = override?.hours ?? officeHours(base.timeZone)
   const days = sampleDays(kind, account.id, now)
   const today = dayOf(now)
   const secondsOf = new Map(days.map(item => [item.day, item]))
   const usedSeconds = secondsOf.get(today)?.seconds ?? 0
   const limitSeconds = limitSecondsOf(mode)
   const { state, nextAt } = stateOf(account.status, usedSeconds, limitSeconds, hours, now, base.waits)

   return {
      accountId: account.id,
      email: account.email,
      clientLabel: override?.clientLabel === undefined ? base.clientLabel : override.clientLabel,
      mode,
      usedSeconds,
      state,
      nextAt,
      hours,
      proxyTimeZone: base.timeZone,
      last30: lastDays(today, 30).map(day => secondsOf.get(day)?.seconds ?? 0),
      idleWorkingDays: idleWorkingDays(days, hours, today),
      overLimitDays14: lastDays(today, 14).filter(day => {
         const item = secondsOf.get(day)

         return item !== undefined && item.seconds > item.limitSeconds
      }).length,
      viewsLeft:
         state === 'NOT_BROWSING' ? null : Math.max(0, Math.floor((limitSeconds - usedSeconds) / SECONDS_PER_VIEW)),
   }
}

const SESSION_KINDS: { action: string; result: string }[] = [
   { action: 'Visit profile', result: 'Done' },
   { action: 'Visit company', result: 'Done' },
   { action: 'Read the feed', result: 'Done' },
   { action: 'Check messages', result: 'Done' },
   { action: 'Sign-in check', result: 'Signed in' },
]

export const sampleSessions = (id: string, { day, seconds, sessions }: DayUsage): DaySession[] => {
   const random = seeded(hash(`${id}:${day}`))
   const each = Math.round(seconds / sessions)
   const gap = Math.floor((OFFICE_END - OFFICE_START) / sessions)

   return Array.from({ length: sessions }, (_, index) => {
      const kind = SESSION_KINDS[Math.floor(random() * SESSION_KINDS.length)] ?? SESSION_KINDS[0]

      return {
         id: `${id}:${day}:${index}`,
         at: clock(OFFICE_START + index * gap + Math.floor(random() * Math.max(1, gap - 1))),
         action: kind?.action ?? 'Visit profile',
         seconds: each,
         result: kind?.result ?? 'Done',
      }
   })
}

const MIX: { label: string; share: number }[] = [
   { label: 'Workflows', share: 0.55 },
   { label: 'Daily visits', share: 0.2 },
   { label: 'Background reads', share: 0.15 },
   { label: 'Sign-in checks', share: 0.1 },
]

export const sampleMix = (usedSeconds: number): UseMixPart[] =>
   usedSeconds > 0 ? MIX.map(({ label, share }) => ({ label, seconds: Math.round(usedSeconds * share) })) : []
