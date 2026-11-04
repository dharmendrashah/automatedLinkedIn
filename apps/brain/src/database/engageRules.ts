import { createHash } from 'node:crypto'

import { ENGAGE_LIMITS, type Reaction } from '@automatedLinkedIn/contracts'

// What the act queue decides without a database (.plan/lead-pipeline-p3-engage.md): the fixed sentences, how long a person waits between
// two acts, and which reaction a post gets.

const DAY_MS = 24 * 60 * 60 * 1000

export const ENGAGE_REASONS = {
   PAUSED: 'Paused by the admin.',
   NO_INVITE: 'No invite from your accounts.',
   NOT_SIGNED_IN: 'Account is not signed in.',
   STOPPED: 'Engaging of the account is stopped for now.',
   DO_NOT_CONTACT: 'On Do not contact.',
   ACCEPTED: 'They accepted.',
   TOO_OLD: 'Post is older than a week.',
   NOT_DUE: 'Not due yet.',
   ALREADY_REACTED: 'Already reacted.',
   ALREADY_COMMENTED: 'Already commented.',
   NO_ROOM: 'No room left today.',
   BAD_LINK: 'Not a post link that can be opened.',
   EXPIRED: 'Not sent in time. It was left.',
   NOT_ANSWERED: 'No answer came from the browser. It is not sent again.',
   REFUSED: 'LinkedIn refused it.',
   GONE: 'The post is gone, or it is not the one asked for.',
   COMMENTS_OFF: 'Comments are off on this post.',
} as const

const unit = (key: string) => createHash('sha256').update(key).digest().readUInt32BE(0) / 2 ** 32

// How long one person waits after their last act: the setting's days plus a stable extra of up to a day, the same on every look.
export const waitAfterAct = (slug: string, daysApart: number) => (daysApart + unit(`wait|${slug}`)) * DAY_MS

// One of the reactions the block ticked, picked by a hash of the post, so a retry picks the same.
export const reactionFor = (postKey: string, reactions: Reaction[]): Reaction =>
   reactions[Math.floor(unit(`reaction|${postKey}`) * reactions.length)] ?? reactions[0] ?? 'like'

export const postTooOld = (postedAt: Date | null, now: Date) =>
   postedAt !== null && now.getTime() - postedAt.getTime() > ENGAGE_LIMITS.postDays * DAY_MS
