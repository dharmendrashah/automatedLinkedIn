import { z } from 'zod'

export const CONNECTIONS_CONTRACT_VERSION = 1

// The connections an account has, as the task `linkedin-connections` reads them, and what became of the one it was asked to remove
// (.plan/my-connections.md). One file per run, named `connections.json`.

// The limits on removing connections, as the owner decided on 2026-10-28. None of them is a LinkedIn number: they are cautious
// guesses. A removal cannot be undone from here, so it is one at a time, a few a day, with a rest between two.
export const CONNECTION_LIMITS = {
   // Removals asked for one account in 24 hours, and the rest between the starts of two, in seconds.
   removePerDay: 10,
   removeGapSeconds: 20,
} as const

// How many connections a read keeps (a read is also capped by time in the task).
export const MAX_CONNECTIONS = 1000

// The part of a member's profile address after /in/, as the page writes it (percent signs for letters outside a to z). The task builds
// a selector from it, so nothing else can pass.
export const CONNECTION_SLUG_PATTERN = /^[A-Za-z0-9_%-]{1,200}$/
export const connectionSlugSchema = z.string().regex(CONNECTION_SLUG_PATTERN)

// A picture is only ever an https address; it is never downloaded by the app.
const pictureUrl = z
   .url({ protocol: /^https$/ })
   .max(1000)
   .optional()

export const connectionSchema = z.strictObject({
   slug: connectionSlugSchema,
   name: z.string().min(1).max(300),
   headline: z.string().max(500),
   // The day they connected, as "Connected on October 27, 2026" says it (English only), as YYYY-MM-DD.
   connectedOn: z.iso.date().optional(),
   photoUrl: pictureUrl,
   // LinkedIn's own number of the member, from the address the Message link opens, so the page can open LinkedIn's message window.
   messageUrn: z
      .string()
      .regex(/^urn:li:fsd_profile:[A-Za-z0-9_-]{1,100}$/)
      .optional(),
})

// REMOVED: the connection left the list after the click. GONE: it was not on the page, so nothing was clicked. UNSURE: it was clicked
// and the page does not say what came of it. NOT_CLICKED: the run stopped before the click.
export const CONNECTION_REMOVALS = ['REMOVED', 'GONE', 'UNSURE', 'NOT_CLICKED'] as const

export const connectionRemovalSchema = z.strictObject({
   slug: connectionSlugSchema,
   outcome: z.enum(CONNECTION_REMOVALS),
})

export const connectionsFileSchema = z.strictObject({
   contract: z.literal(CONNECTIONS_CONTRACT_VERSION),
   captured_at: z.iso.datetime(),
   // How many connections LinkedIn says the account has, when the page says.
   total: z.number().int().min(0).optional(),
   // Whether the list holds every connection the page has (false when the read was capped or a row could not be read).
   complete: z.boolean(),
   connections: z.array(connectionSchema).max(MAX_CONNECTIONS),
   removal: connectionRemovalSchema.optional(),
})

export type Connection = z.infer<typeof connectionSchema>
export type ConnectionRemoval = z.infer<typeof connectionRemovalSchema>
export type ConnectionsFile = z.infer<typeof connectionsFileSchema>
