import { z } from 'zod'

import { connectionSlugSchema } from './connections'

export const INVITES_CONTRACT_VERSION = 2

// Connection invites an account sends, and the ones it withdraws, through the task `linkedin-invite` (.plan/network-invites.md).
// One file per run, named `invites.json`, says what became of each.

// The limits the owner locked on 2026-10-30 (.plan/network-hub.md). Not LinkedIn's own numbers: LinkedIn may stop an account
// sooner, which the task reads as LIMIT_REACHED. The page keeps a copy (`apps/body/src/components/my-network/invite-rules.ts`)
// and a test keeps it equal to this one.
export const INVITE_LIMITS = {
   // Invites one account sends in 24 hours and in 7 days.
   perDay: 20,
   perWeek: 100,
   // Invites and withdrawals one run is asked for.
   perRun: 5,
   withdrawPerRun: 10,
   // The rest between two invites of a run, in seconds.
   gapSeconds: {
      min: 30,
      max: 90,
   },
   // The longest note the box of a free account takes (it counts to 200, recorded 2026-10-30; Premium is said to take 300).
   noteChars: 200,
   // An invite still pending this many days is withdrawn; a person invited or withdrawn this recently is not invited again.
   pendingDays: 21,
   // How many days ahead one request may plan.
   planDays: 14,
} as const

// Brain's own id of an invite: the task only hands it back.
const inviteIdSchema = z.uuid()

export const inviteSendSchema = z.strictObject({
   id: inviteIdSchema,
   slug: connectionSlugSchema,
   // The person's name as stored, to check the profile is theirs.
   name: z.string().trim().min(1).max(200),
   // Filled in by brain; empty for an invite without a note.
   note: z.string().trim().min(1).max(INVITE_LIMITS.noteChars).optional(),
})

export const inviteWithdrawSchema = z.strictObject({
   id: inviteIdSchema,
   slug: connectionSlugSchema,
   name: z.string().trim().min(1).max(200),
})

export const inviteInputSchema = z
   .strictObject({
      send: z.array(inviteSendSchema).max(INVITE_LIMITS.perRun).default([]),
      withdraw: z.array(inviteWithdrawSchema).max(INVITE_LIMITS.withdrawPerRun).default([]),
      // The account has used its free notes this month (.plan/invite-note-fallback.md): invites go without their note.
      notesOut: z.boolean().optional(),
   })
   .refine(input => input.send.length + input.withdraw.length > 0, 'Nothing to send or withdraw')

// SENT: the invite left (the Connect button went away after Send). ALREADY_CONNECTED, ALREADY_PENDING: the profile said so, nothing
// pressed. NO_CONNECT: the profile showed no Connect button for the person. NOTE_REFUSED: LinkedIn gave no place for the note (free
// accounts get few), nothing sent. EMAIL_NEEDED: LinkedIn asked for the person's email, nothing sent. NOT_AVAILABLE: the address led
// to no profile. LIMIT_REACHED: LinkedIn said the account may not invite more now. REFUSED: LinkedIn answered the invite request with an
// error, so it did not go. UNSURE: Send was pressed and the page did not say. SENT_WITHOUT_NOTE: LinkedIn refused the note before Send
// (no free notes left), and the invite left without it.
// NOT_SENT: the run stopped before its turn, or a step did not show, nothing pressed.
export const INVITE_SEND_OUTCOMES = [
   'SENT',
   'SENT_WITHOUT_NOTE',
   'ALREADY_CONNECTED',
   'ALREADY_PENDING',
   'NO_CONNECT',
   'NOTE_REFUSED',
   'EMAIL_NEEDED',
   'NOT_AVAILABLE',
   'LIMIT_REACHED',
   'REFUSED',
   'UNSURE',
   'NOT_SENT',
] as const

// WITHDRAWN: the row left the Sent list after Withdraw. NOT_PENDING: it was not on the list, nothing pressed. UNSURE: pressed and the
// page did not say. NOT_CLICKED: the run stopped before its turn, or a step did not show.
export const INVITE_WITHDRAW_OUTCOMES = ['WITHDRAWN', 'NOT_PENDING', 'UNSURE', 'NOT_CLICKED'] as const

export const invitesFileSchema = z.strictObject({
   // A run of the task's version 1 may still finish after brain moved on to contract 2; its file reads the same.
   contract: z.union([z.literal(1), z.literal(INVITES_CONTRACT_VERSION)]),
   captured_at: z.iso.datetime(),
   sent: z
      .array(
         z.strictObject({
            id: inviteIdSchema,
            outcome: z.enum(INVITE_SEND_OUTCOMES),
            // LinkedIn's own number of the member, from the Connect button, when it showed.
            memberId: z
               .string()
               .regex(/^\d{1,20}$/)
               .optional(),
         })
      )
      .max(INVITE_LIMITS.perRun),
   withdrawn: z
      .array(
         z.strictObject({
            id: inviteIdSchema,
            outcome: z.enum(INVITE_WITHDRAW_OUTCOMES),
         })
      )
      .max(INVITE_LIMITS.withdrawPerRun),
})

export type InviteInput = z.infer<typeof inviteInputSchema>
export type InviteSend = z.infer<typeof inviteSendSchema>
export type InviteWithdraw = z.infer<typeof inviteWithdrawSchema>
export type InviteSendOutcome = (typeof INVITE_SEND_OUTCOMES)[number]
export type InviteWithdrawOutcome = (typeof INVITE_WITHDRAW_OUTCOMES)[number]
export type InvitesFile = z.infer<typeof invitesFileSchema>
