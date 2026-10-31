import { type LinkedInInviteState } from 'generated/prisma/client'

import { INVITE_LIMITS, type InviteSendOutcome, type InviteWithdrawOutcome } from '@automatedLinkedIn/contracts'

// What brain decides about connection invites (.plan/network-invites.md), without a database: when each invite may go, which people
// are skipped and why, the sentence the owner reads before inviting, and what a run's outcome makes of an invite.

const DAY_MS = 24 * 60 * 60 * 1000

// Invites that count toward an account's limits once their send run was asked for, and invites still alive (one per client and person).
export const COUNTED: LinkedInInviteState[] = [
   'SENDING',
   'SENT',
   'ACCEPTED',
   'UNKNOWN',
   'WITHDRAW_QUEUED',
   'WITHDRAWING',
   'WITHDRAWN',
]
export const LIVE: LinkedInInviteState[] = ['QUEUED', 'SENDING', 'SENT', 'UNKNOWN', 'WITHDRAW_QUEUED', 'WITHDRAWING']
// Sent and not answered: what the acceptance read and the withdraw job look at.
export const PENDING: LinkedInInviteState[] = ['SENT', 'UNKNOWN', 'WITHDRAW_QUEUED']

export const SKIP_REASONS = {
   DO_NOT_CONTACT: 'on Do not contact',
   CONNECTED: 'already connected',
   REQUEST: 'with a request pending',
   INVITED: `invited in the last ${INVITE_LIMITS.pendingDays / 7} weeks`,
} as const

export type SkipReason = keyof typeof SKIP_REASONS

export type InviteFacts = {
   doNotContact: boolean
   connected: boolean
   requestPending: boolean
   invitedRecently: boolean
}

export const skipReasonOf = (facts: InviteFacts): SkipReason | undefined => {
   if (facts.doNotContact) {
      return 'DO_NOT_CONTACT'
   }

   if (facts.connected) {
      return 'CONNECTED'
   }

   if (facts.requestPending) {
      return 'REQUEST'
   }

   return facts.invitedRecently ? 'INVITED' : undefined
}

// The 24-hour block a time falls in, counted from now (the last 24 hours are -1).
const blockOf = (now: Date, at: Date) => Math.floor((at.getTime() - now.getTime()) / DAY_MS)

// When each of `count` new invites of one account may go: today while the day's and the week's room last, then the next days, at
// most `planDays` ahead. `started` are the account's invites of the last 7 days, `planned` the ones already waiting. Fewer times
// than `count` means the rest do not fit. The days are 24-hour blocks from now; the send job checks the real limits again.
export const planInvites = ({
   now,
   started,
   planned,
   count,
}: {
   now: Date
   started: Date[]
   planned: Date[]
   count: number
}) => {
   const used = new Map<number, number>()
   const add = (block: number, by = 1) => used.set(block, (used.get(block) ?? 0) + by)

   started.forEach(at => add(Math.max(-7, Math.min(-1, blockOf(now, at)))))
   planned.forEach(at => add(Math.max(0, blockOf(now, at))))

   const usedOn = (block: number) => used.get(block) ?? 0
   const room = (block: number) => {
      const day = usedOn(block) + (block === 0 ? usedOn(-1) : 0)
      let week = 0

      for (let back = block - 6; back <= block; back += 1) {
         week += usedOn(back)
      }

      return Math.max(0, Math.min(INVITE_LIMITS.perDay - day, INVITE_LIMITS.perWeek - week))
   }
   const today = room(0)
   const times: Date[] = []

   for (let block = 0; block < INVITE_LIMITS.planDays && times.length < count; block += 1) {
      const fits = Math.min(room(block), count - times.length)

      for (let one = 0; one < fits; one += 1) {
         times.push(new Date(now.getTime() + block * DAY_MS))
      }

      add(block, fits)
   }

   return {
      today,
      times,
   }
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

// The one sentence of the invite dialog: what is safe today, how the selection spreads over the days, and what was left out or
// skipped, with why.
export const inviteSentence = ({
   now,
   today,
   times,
   selected,
   skipped,
}: {
   now: Date
   today: number
   times: Date[]
   selected: number
   skipped: Partial<Record<SkipReason, number>>
}) => {
   const toInvite = selected - Object.values(skipped).reduce((sum, count) => sum + count, 0)
   const now0 = now.getTime()
   const onFirstDay = times.filter(at => at.getTime() - now0 < DAY_MS).length
   const lastDay = times.reduce((last, at) => Math.max(last, blockOf(now, at)), 0)
   const parts = [`You can safely send ${today} today.`]

   if (toInvite > 0) {
      const spread =
         onFirstDay === times.length
            ? 'all today'
            : `${onFirstDay === 0 ? 'none' : onFirstDay} today, the rest over the next ${plural(lastDay, 'day')}`

      parts.push(`${selected} selected: ${spread}.`)
   }

   const leftOut = toInvite - times.length

   if (leftOut > 0) {
      parts.push(
         `${plural(leftOut, 'more person', 'more people')} than ${INVITE_LIMITS.planDays} days can hold ${leftOut === 1 ? 'is' : 'are'} left out.`
      )
   }

   const reasons = (Object.entries(skipped) as Array<[SkipReason, number]>)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${count} ${SKIP_REASONS[reason]}`)

   if (reasons.length > 0) {
      parts.push(`Skipped: ${reasons.join(', ')}.`)
   }

   return parts.join(' ')
}

// The note with the person's own words put in: {first_name} and {company}, then cut to what LinkedIn takes.
export const fillNote = (note: string | undefined, person: { name: string | null; company: string | null }) => {
   if (!note?.trim()) {
      return undefined
   }

   const [first = ''] = (person.name ?? '').trim().split(/\s+/)
   const filled = note
      .replaceAll('{first_name}', first)
      .replaceAll('{company}', person.company ?? '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
      .slice(0, INVITE_LIMITS.noteChars)

   return filled || undefined
}

const GIVE_UP_AFTER = 3

export type InviteChange = {
   state: LinkedInInviteState
   reason?: string | null
   tries?: number
   invitedAt?: Date
   withdrawnAt?: Date
   memberId?: string
}

// LinkedIn gives free accounts a few invite notes a month; once they are used up, notes come back on the 1st (UTC, the closest known).
export const notesBackAt = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

// What one outcome of a run makes of an invite. NOT_SENT and LIMIT_REACHED keep it in the queue (a few times for the first).
export const sendChange = (outcome: InviteSendOutcome, tries: number, now: Date, memberId?: string): InviteChange => {
   const member = memberId ? { memberId } : {}

   switch (outcome) {
      case 'SENT':
         return {
            state: 'SENT',
            reason: null,
            invitedAt: now,
            ...member,
         }
      case 'SENT_WITHOUT_NOTE':
         return {
            state: 'SENT',
            reason: 'Sent without the note: no free notes left this month.',
            invitedAt: now,
            ...member,
         }
      case 'ALREADY_PENDING':
         return {
            state: 'SENT',
            reason: 'An invite was already waiting on LinkedIn.',
            invitedAt: now,
            ...member,
         }
      case 'ALREADY_CONNECTED':
         return {
            state: 'SKIPPED',
            reason: 'Already connected on LinkedIn.',
         }
      case 'NO_CONNECT':
         return {
            state: 'FAILED',
            reason: 'LinkedIn showed no Connect button on the profile. Nothing was sent.',
         }
      case 'NOTE_REFUSED':
         return {
            state: 'FAILED',
            reason: 'LinkedIn gave no place for the note (free accounts get a few a month). Nothing was sent.',
            ...member,
         }
      case 'EMAIL_NEEDED':
         return {
            state: 'FAILED',
            reason: "LinkedIn asked for the person's email address. Nothing was sent.",
            ...member,
         }
      case 'NOT_AVAILABLE':
         return {
            state: 'FAILED',
            reason: 'The profile could not be opened. Nothing was sent.',
         }
      case 'REFUSED':
         return {
            state: 'FAILED',
            reason: 'LinkedIn refused the invite. Nothing was sent.',
            ...member,
         }
      case 'LIMIT_REACHED':
         return {
            state: 'QUEUED',
            reason: null,
         }
      case 'UNSURE':
         return {
            state: 'UNKNOWN',
            reason: 'LinkedIn did not show whether it was sent. It is not sent again.',
            ...member,
         }
      case 'NOT_SENT':
         return tries + 1 >= GIVE_UP_AFTER
            ? {
                 state: 'FAILED',
                 reason: `It could not be sent in ${GIVE_UP_AFTER} tries. Nothing was sent.`,
                 tries: tries + 1,
              }
            : {
                 state: 'QUEUED',
                 tries: tries + 1,
              }
   }
}

export const withdrawChange = (outcome: InviteWithdrawOutcome, tries: number, now: Date): InviteChange => {
   switch (outcome) {
      case 'WITHDRAWN':
         return {
            state: 'WITHDRAWN',
            reason: `Withdrawn after ${INVITE_LIMITS.pendingDays / 7} weeks without an answer.`,
            withdrawnAt: now,
         }
      case 'NOT_PENDING':
         return {
            state: 'WITHDRAWN',
            reason: 'It was no longer pending on LinkedIn.',
            withdrawnAt: now,
         }
      default:
         return tries + 1 >= GIVE_UP_AFTER
            ? {
                 state: 'WITHDRAWN',
                 reason: 'It could not be withdrawn; check the Sent list on LinkedIn.',
                 tries: tries + 1,
                 withdrawnAt: now,
              }
            : {
                 state: 'WITHDRAW_QUEUED',
                 tries: tries + 1,
              }
   }
}
