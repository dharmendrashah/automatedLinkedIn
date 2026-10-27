import { z } from 'zod'

export const INVITATIONS_CONTRACT_VERSION = 1

// The connection requests an account received, as the task `linkedin-invitations` reads them (.plan/my-network-invitations.md), and
// what became of each request it was asked to answer. One file per run, named `invitations.json`.

// The limits on answering requests, as the owner decided on 2026-10-27. None of them is a LinkedIn number: they are cautious guesses.
// The page keeps a copy (`apps/body/src/components/network/rules.ts`) and a test keeps it equal to this one.
export const INVITATION_LIMITS = {
   // Answers in one run, and for one account in 24 hours.
   perRun: 10,
   perDay: 50,
   // The rest between two answers of a run, in seconds.
   gapSeconds: {
      min: 4,
      max: 9,
   },
} as const

// How many requests a read keeps, and how many answers one run may be asked for.
export const MAX_INVITATIONS = 100
export const MAX_INVITATION_ANSWERS = INVITATION_LIMITS.perRun

export const INVITATION_ACTIONS = ['ACCEPT', 'IGNORE'] as const
export const invitationActionSchema = z.enum(INVITATION_ACTIONS)

// The number LinkedIn gives a request (19 digits today); the task builds a selector from it, so it is digits only.
export const INVITATION_ID_PATTERN = /^\d{15,25}$/
export const invitationIdSchema = z.string().regex(INVITATION_ID_PATTERN)

// A picture is only ever an https address; it is never downloaded by the app.
const pictureUrl = z
   .url({ protocol: /^https$/ })
   .max(1000)
   .optional()

export const invitationSchema = z.strictObject({
   id: invitationIdSchema,
   // The part of the sender's profile address after /in/.
   slug: z.string().min(1).max(200),
   name: z.string().min(1).max(300),
   headline: z.string().max(500),
   // "Anurag Chaubey is a mutual connection", as the page writes it.
   mutual: z.string().max(300).optional(),
   // What the sender wrote with the request.
   note: z.string().max(5000).optional(),
   photoUrl: pictureUrl,
})

// ACCEPTED and IGNORED: the request left the page after the click. GONE: it was not on the page, so nothing was clicked.
// UNSURE: it was clicked and the page does not say what came of it. NOT_CLICKED: the run stopped before its turn.
export const INVITATION_OUTCOMES = ['ACCEPTED', 'IGNORED', 'GONE', 'UNSURE', 'NOT_CLICKED'] as const

export const invitationOutcomeSchema = z.strictObject({
   id: invitationIdSchema,
   action: invitationActionSchema,
   outcome: z.enum(INVITATION_OUTCOMES),
})

export const invitationsFileSchema = z.strictObject({
   contract: z.literal(INVITATIONS_CONTRACT_VERSION),
   captured_at: z.iso.datetime(),
   // How many requests LinkedIn says wait, when the page says.
   total: z.number().int().min(0).optional(),
   // Whether the list holds every request the page has (false when the read was capped or a row could not be read).
   complete: z.boolean(),
   invitations: z.array(invitationSchema).max(MAX_INVITATIONS),
   outcomes: z.array(invitationOutcomeSchema).max(MAX_INVITATION_ANSWERS),
})

export type Invitation = z.infer<typeof invitationSchema>
export type InvitationAction = z.infer<typeof invitationActionSchema>
export type InvitationOutcome = z.infer<typeof invitationOutcomeSchema>
export type InvitationsFile = z.infer<typeof invitationsFileSchema>
