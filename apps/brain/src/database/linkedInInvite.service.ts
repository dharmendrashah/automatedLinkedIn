import { type PersonFacts, templateValues } from 'core'

import { type LinkedInInviteState, type Prisma } from 'generated/prisma/client'

import { INVITE_LIMITS, type InvitesFile } from '@automatedLinkedIn/contracts'

import { AccountLimitsService } from './accountLimits.service'
import {
   COUNTED,
   LIVE,
   PENDING,
   type SkipReason,
   UNUSABLE_INVITE_SENTENCE,
   UNUSABLE_WITHDRAW_SENTENCE,
   askable,
   fillNote,
   inviteSentence,
   noteSentOf,
   notesBackAt,
   planInvites,
   sendChange,
   sendInput,
   skipReasonOf,
   withdrawChange,
} from './inviteRules'
import { pendingLevel } from './limits'
import { INVITE_TASK } from './linkedInInvite.hooks'
import { MessageValuesService } from './messageValues.service'
import { budgetWait } from './postPublication.rules'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { BrowseBudgetError, TaskBusyError, TaskRefusedError, TaskUnavailableError } from './taskErrors'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const PENDING_MS = INVITE_LIMITS.pendingDays * DAY_MS
// A run asked for this long ago and not answered was lost with it (the task's limit is 15 minutes, the outbox may hold it 15).
const STALE_MS = 45 * 60 * 1000
// A refusal that is not about browsing time (the account not signed in, say) is tried again after this.
const REFUSED_WAIT_MS = 30 * 60 * 1000
const STALE_SENTENCE = 'No answer came from the browser. It is not sent again.'
const BLOCKED_SENTENCE = 'On Do not contact. Nothing was sent.'
const PAUSED_SENTENCE = 'This account has too many pending invites. New invites for it are paused.'

const SKIP_SENTENCES: Record<SkipReason, string> = {
   DO_NOT_CONTACT: 'On Do not contact.',
   CONNECTED: 'Already connected.',
   REQUEST: 'A connection request is pending.',
   INVITED: 'An invite is still pending.',
}

// Another process took the invites first: they stay as it left them.
class InvitesTaken extends Error {}

export type InviteRequest = {
   personIds: string[]
   // The account that sends; may be left out when the owner has one signed-in account.
   accountId?: string
   note?: string
   // The Found by source the owner was looking at, credited with the accepts.
   source?: string
   // The workflow block that plans it, so campaigns can be told apart.
   origin?: InviteOrigin
   // The most days ahead it may be planned; the planner's own number when left out.
   days?: number
}

export type InviteOrigin = { workflowId: string; runId: string; nodeId: string }

// Someone to invite: what My network or the block knows of them.
type Prospect = { slug: string; name: string | null; company: string | null; doNotContact: boolean; foundBy: string[] }

export type Link = { slug: string; name: string | null; company: string | null }

// What became of one person of a request: queued for a day, skipped with why, or left out because the days are full.
export type InviteOutcome = {
   slug: string
   state: 'QUEUED' | 'SKIPPED' | 'LEFT'
   reason: string | null
   plannedAt: Date | null
}

type Account = { id: string; email: string; displayName: string | null }

const accountName = (account: Account) => account.displayName ?? account.email

const slugKey = (slug: string) => {
   try {
      return decodeURIComponent(slug).toLowerCase()
   } catch {
      return slug.toLowerCase()
   }
}

// Whether an account's invites are stopped now: until a time, or until a sign-in after they stopped.
const stopped = (
   account: { invitesStoppedAt: Date | null; invitesStopUntil: Date | null; lastVerifiedAt: Date | null },
   now: Date
) => {
   if (!account.invitesStoppedAt) {
      return false
   }

   return account.invitesStopUntil
      ? account.invitesStopUntil > now
      : !(account.lastVerifiedAt && account.lastVerifiedAt > account.invitesStoppedAt)
}

// Connection invites from My network (.plan/network-invites.md): planned per account over the days, sent by `linkedin-invite` runs of
// up to 5, never withdrawn by the tool on its own (an owner may withdraw), and marked accepted by the reads of the newest connections.
// Every call is scoped to the owner.
export class LinkedInInviteService {
   // The owner's signed-in accounts that can send, oldest first.
   private static accountsOf(userId: string) {
      return PrismaService.client.linkedInAccount.findMany({
         where: {
            userId,
            status: 'ACTIVE',
         },
         orderBy: { createdAt: 'asc' },
         select: {
            id: true,
            email: true,
            displayName: true,
            invitesStoppedAt: true,
            invitesStopUntil: true,
            lastVerifiedAt: true,
         },
      })
   }

   // The due invites with the name My network has now and their note filled in from it (an address-named invite gets the name a
   // read brought since). A person no longer on My network keeps the invite's own name.
   private static async withNames(
      sends: Array<{ id: string; userId: string; slug: string; name: string; note: string | null }>
   ) {
      const people = await PrismaService.client.person.findMany({
         where: {
            OR: sends.map(({ userId, slug }) => ({
               userId,
               slug,
            })),
         },
         select: {
            userId: true,
            slug: true,
            name: true,
            company: true,
         },
      })
      const personOf = new Map(people.map(person => [`${person.userId}:${person.slug}`, person]))
      const owners = [...new Set(sends.map(({ userId }) => userId))]
      // What else the database knows about each person, for the variables of a note written with them.
      const facts = new Map<string, PersonFacts>(
         (
            await Promise.all(
               owners.map(async userId => {
                  const found = await MessageValuesService.factsFor(
                     userId,
                     sends.filter(send => send.userId === userId && send.note).map(({ slug }) => slug)
                  )

                  return [...found].map(([slug, one]) => [`${userId}:${slug}`, one] as const)
               })
            )
         ).flat()
      )

      return sends.map(invite => {
         const key = `${invite.userId}:${invite.slug}`
         const person = personOf.get(key)
         const name = person?.name ?? invite.name

         return {
            id: invite.id,
            slug: invite.slug,
            name,
            note: fillNote(
               invite.note ?? undefined,
               templateValues(
                  {
                     ...facts.get(key),
                     name: name === invite.slug ? null : name,
                     company: person?.company ?? facts.get(key)?.company,
                  },
                  { slug: invite.slug }
               )
            ),
         }
      })
   }

   // The picked people of My network.
   private static prospects(userId: string, personIds: string[]): Promise<Prospect[]> {
      return PrismaService.client.person.findMany({
         where: {
            id: { in: personIds },
            userId,
         },
         select: {
            slug: true,
            name: true,
            company: true,
            doNotContact: true,
            foundBy: true,
         },
      })
   }

   // People a workflow block holds: My network's own row when there is one, else what the block knows of them.
   private static async prospectsOfLinks(userId: string, links: Link[]): Promise<Prospect[]> {
      const known = await PrismaService.client.person.findMany({
         where: {
            userId,
            slug: { in: links.map(({ slug }) => slug) },
         },
         select: {
            slug: true,
            name: true,
            company: true,
            doNotContact: true,
            foundBy: true,
         },
      })
      const byslug = new Map(known.map(person => [person.slug, person]))

      return links.map(
         link =>
            byslug.get(link.slug) ?? {
               slug: link.slug,
               name: link.name,
               company: link.company,
               doNotContact: false,
               foundBy: [],
            }
      )
   }

   // Why each person would be skipped, or not.
   private static async facts(userId: string, people: Prospect[], now: Date) {
      const db = PrismaService.client
      const slugs = people.map(({ slug }) => slug)
      const [suppressed, requests, invites, connections] = await Promise.all([
         db.suppression.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: { slug: true },
         }),
         db.linkedInInvitation.findMany({
            where: {
               userId,
               slug: { in: slugs },
               status: { in: ['PENDING', 'QUEUED'] },
            },
            select: { slug: true },
         }),
         db.linkedInInvite.findMany({
            where: {
               userId,
               slug: { in: slugs },
               OR: [
                  { state: { in: LIVE } },
                  {
                     state: { in: ['WITHDRAWN', 'ACCEPTED'] },
                     createdAt: { gte: new Date(now.getTime() - PENDING_MS) },
                  },
               ],
            },
            select: { slug: true },
         }),
         db.linkedInConnection.findMany({
            where: {
               userId,
               slug: { in: slugs },
               status: 'CONNECTED',
            },
            select: { slug: true },
         }),
      ])
      const blocked = new Set(suppressed.map(({ slug }) => slug))
      const asked = new Set(requests.map(({ slug }) => slug))
      const invited = new Set(invites.map(({ slug }) => slug))
      const connected = new Set(connections.map(({ slug }) => slug))

      return people.map(person => ({
         person,
         skip: skipReasonOf({
            doNotContact: person.doNotContact || blocked.has(person.slug),
            connected: person.foundBy.includes('connection') || connected.has(person.slug),
            requestPending: asked.has(person.slug),
            invitedRecently: invited.has(person.slug),
         }),
      }))
   }

   // What inviting these people would do, without doing it: the account that sends, the sentence, and the counts.
   public static async plan(userId: string, request: Omit<InviteRequest, 'note' | 'source'>, now = new Date()) {
      return this.planOf(userId, request, await this.prospects(userId, request.personIds), now)
   }

   private static async planOf(
      userId: string,
      request: Omit<InviteRequest, 'note' | 'source'>,
      people: Prospect[],
      now: Date
   ) {
      const accounts = await this.accountsOf(userId)
      const open = await this.notPaused(accounts)
      const chosen = accounts.find(({ id }) => id === request.accountId)

      if (chosen && !open.includes(chosen)) {
         throw new TaskRefusedError(PAUSED_SENTENCE)
      }

      const account = chosen ?? (await this.roomiest(open, now))

      if (!account) {
         throw new TaskRefusedError(
            accounts.length > 0 ? PAUSED_SENTENCE : 'Inviting needs a signed-in account. Run Test login first.'
         )
      }

      const facts = await this.facts(userId, people, now)
      const skipped = this.skipCounts(facts)
      const toInvite = facts.filter(({ skip }) => skip === undefined).length
      const unnamed = facts.filter(({ person, skip }) => skip === undefined && !person.name).length
      const { today, times } = planInvites({
         now,
         ...(await this.usage(account.id, now)),
         count: toInvite,
         limits: await this.limitsOf(account.id, now),
         ...(request.days !== undefined && { days: request.days }),
      })

      return {
         accountId: account.id,
         accounts: accounts.map(one => ({
            id: one.id,
            name: accountName(one),
         })),
         today,
         toInvite: times.length,
         // People to invite My network has no name for yet: {first_name} is empty for them unless a read lands first.
         unnamed,
         skipped,
         sentence: inviteSentence({
            now,
            today,
            times,
            selected: facts.length,
            skipped,
         }),
      }
   }

   // Queues the invites as planned: each person not skipped gets one row with its planned time, each skipped one a SKIPPED row with
   // why, and what 14 days cannot hold is left out.
   public static async invite(userId: string, request: InviteRequest, now = new Date()) {
      const made = await this.queue(userId, request, await this.prospects(userId, request.personIds), now)

      return {
         queued: made.queued,
         skipped: made.skipped,
         sentence: made.sentence,
      }
   }

   // What "Send connection request" asks: the people go out from one account. Null when the account is not the owner's.
   public static async inviteFrom(
      userId: string,
      accountId: string,
      people: Link[],
      note: string,
      now = new Date(),
      origin?: InviteOrigin,
      days?: number
   ) {
      const account = await PrismaService.client.linkedInAccount.findFirst({
         where: {
            id: accountId,
            userId,
         },
         select: { id: true },
      })

      if (!account) {
         return null
      }

      return this.inviteLinks(
         userId,
         {
            accountId,
            note,
            people,
            ...(origin && { origin }),
            ...(days !== undefined && { days }),
         },
         now
      )
   }

   // The same for people a workflow block holds, who may not be in My network yet: they join it once their invite is queued.
   public static async inviteLinks(
      userId: string,
      request: Omit<InviteRequest, 'personIds' | 'source'> & { people: Link[] },
      now = new Date()
   ) {
      const { people, ...rest } = request

      return this.queue(
         userId,
         {
            ...rest,
            personIds: [],
         },
         await this.prospectsOfLinks(userId, people),
         now
      )
   }

   private static async queue(userId: string, request: InviteRequest, people: Prospect[], now: Date) {
      const plan = await this.planOf(userId, request, people, now)
      const { accountId } = plan
      const facts = await this.facts(userId, people, now)
      const db = PrismaService.client
      const limits = await this.limitsOf(accountId, now)
      const queued = await db.$transaction(async tx => {
         // The account row is locked so two requests at once plan from the same counts.
         await tx.$queryRaw`SELECT "id" FROM "LinkedInAccount" WHERE "id" = ${accountId} FOR UPDATE`

         const wanted = facts.filter(({ skip }) => skip === undefined)
         const { times } = planInvites({
            now,
            ...(await this.usage(accountId, now, tx)),
            count: wanted.length,
            limits,
            ...(request.days !== undefined && { days: request.days }),
         })
         const rows = wanted.slice(0, times.length).map(({ person }, index) => ({
            userId,
            accountId,
            slug: person.slug,
            name: person.name ?? person.slug,
            // Filled in when it goes, with the name and company My network has then.
            note: request.note?.trim() || null,
            source:
               request.source && person.foundBy.includes(request.source)
                  ? request.source
                  : (person.foundBy.find(source => source.startsWith('list:')) ?? person.foundBy[0] ?? null),
            plannedAt: times[index] ?? now,
            ...(request.origin && {
               originWorkflowId: request.origin.workflowId,
               originRunId: request.origin.runId,
               originNodeId: request.origin.nodeId,
            }),
         }))
         const made = await tx.linkedInInvite.createMany({
            data: rows,
            skipDuplicates: true,
         })

         await tx.linkedInInvite.createMany({
            data: facts.flatMap(({ person, skip }) =>
               skip
                  ? [
                       {
                          userId,
                          accountId,
                          slug: person.slug,
                          name: person.name ?? person.slug,
                          state: 'SKIPPED' as const,
                          reason: SKIP_SENTENCES[skip],
                          plannedAt: now,
                       },
                    ]
                  : []
            ),
         })

         return {
            count: made.count,
            outcomes: facts.map(({ person, skip }): InviteOutcome => {
               const index = rows.findIndex(({ slug }) => slug === person.slug)

               return skip
                  ? {
                       slug: person.slug,
                       state: 'SKIPPED',
                       reason: SKIP_SENTENCES[skip],
                       plannedAt: null,
                    }
                  : index >= 0
                    ? {
                         slug: person.slug,
                         state: 'QUEUED',
                         reason: null,
                         plannedAt: rows[index]?.plannedAt ?? now,
                      }
                    : {
                         slug: person.slug,
                         state: 'LEFT',
                         reason: `Does not fit in the next ${request.days ?? INVITE_LIMITS.planDays} days of this account's room.`,
                         plannedAt: null,
                      }
            }),
         }
      })

      return {
         queued: queued.count,
         outcomes: queued.outcomes,
         skipped: plan.skipped,
         sentence: plan.sentence,
      }
   }

   // Takes back the pending invites of these people in these accounts: one that has not gone yet is cancelled, one sent and not
   // answered is queued for the withdraw run (the invite-send job asks for it). Answers by person which it was.
   public static async withdraw(userId: string, accountIds: string[], slugs: string[]) {
      const db = PrismaService.client
      const rows = await db.linkedInInvite.findMany({
         where: {
            userId,
            accountId: { in: accountIds },
            slug: { in: slugs },
            state: { in: ['QUEUED', 'SENT', 'UNKNOWN', 'WITHDRAW_QUEUED', 'WITHDRAWING'] },
         },
         orderBy: { createdAt: 'desc' },
         select: {
            id: true,
            slug: true,
            accountId: true,
            state: true,
         },
      })
      const mine = [...new Map(rows.reverse().map(row => [row.slug, row])).values()]
      const cancel = mine.filter(({ state }) => state === 'QUEUED').map(({ id }) => id)
      const queue = mine.filter(({ state }) => state === 'SENT' || state === 'UNKNOWN').map(({ id }) => id)

      await db.linkedInInvite.updateMany({
         where: {
            id: { in: cancel },
            state: 'QUEUED',
         },
         data: { state: 'CANCELLED' },
      })
      await db.linkedInInvite.updateMany({
         where: {
            id: { in: queue },
            state: { in: ['SENT', 'UNKNOWN'] },
         },
         data: {
            state: 'WITHDRAW_QUEUED',
            tries: 0,
         },
      })

      return new Map(
         mine.map(({ slug, accountId, state }) => [
            slug,
            {
               accountId,
               taken: state === 'QUEUED' ? ('CANCELLED' as const) : ('QUEUED' as const),
            },
         ])
      )
   }

   // Takes back an invite that has not gone yet. False when it is not the owner's or no longer queued.
   public static async cancel(userId: string, id: string) {
      const { count } = await PrismaService.client.linkedInInvite.updateMany({
         where: {
            id,
            userId,
            state: 'QUEUED',
         },
         data: { state: 'CANCELLED' },
      })

      return count === 1
   }

   // The invites of one person, newest first, for the drawer.
   public static async ofPerson(userId: string, personId: string) {
      const person = await PrismaService.client.person.findFirst({
         where: {
            id: personId,
            userId,
         },
         select: { slug: true },
      })

      if (!person) {
         return null
      }

      return PrismaService.client.linkedInInvite.findMany({
         where: {
            userId,
            slug: person.slug,
            state: { not: 'SKIPPED' },
         },
         orderBy: { createdAt: 'desc' },
         take: 20,
         select: {
            id: true,
            state: true,
            reason: true,
            note: true,
            plannedAt: true,
            waitReason: true,
            waitUntil: true,
            createdAt: true,
            invitedAt: true,
            acceptedAt: true,
            withdrawnAt: true,
            account: {
               select: {
                  email: true,
                  displayName: true,
               },
            },
         },
      })
   }

   // Starts the account's next run when it may: signed in, its invites not stopped, nothing of its invites running, and room in its day
   // and week. A run sends up to 5 invites that are due and withdraws up to 10 old ones. Resolves to what happened, for the job's log.
   public static async dispatchNext(accountId: string, now = new Date()): Promise<{ asked: boolean; reason?: string }> {
      const db = PrismaService.client
      const account = await db.linkedInAccount.findUnique({
         where: { id: accountId },
         select: {
            userId: true,
            status: true,
            lastVerifiedAt: true,
            invitesStoppedAt: true,
            invitesStopUntil: true,
            invitesStopReason: true,
            notesOutUntil: true,
         },
      })

      if (account?.status !== 'ACTIVE') {
         return {
            asked: false,
            reason: 'The account is not signed in',
         }
      }

      if (stopped(account, now)) {
         return {
            asked: false,
            reason: 'Invites of the account are stopped',
         }
      }

      const busy = await db.linkedInInvite.count({
         where: {
            accountId,
            state: { in: ['SENDING', 'WITHDRAWING'] },
         },
      })

      if (busy > 0) {
         return {
            asked: false,
            reason: 'A run of the account is going',
         }
      }

      await this.dropUnwanted(accountId, account.userId)

      const { started } = await this.usage(accountId, now)
      const limits = await this.limitsOf(accountId, now)
      const day = started.filter(at => at.getTime() > now.getTime() - DAY_MS).length
      // An account with too many pending invites sends no new ones; what it has queued waits.
      const paused = pendingLevel(await this.pendingOf(accountId)) === 'paused'
      const room = paused
         ? 0
         : Math.max(0, Math.min(INVITE_LIMITS.perRun, limits.perDay - day, limits.perWeek - started.length))
      const due: Prisma.LinkedInInviteWhereInput = {
         accountId,
         OR: [{ waitUntil: null }, { waitUntil: { lte: now } }],
      }
      const [sends, withdrawals] = await Promise.all([
         room > 0
            ? db.linkedInInvite.findMany({
                 where: {
                    ...due,
                    state: 'QUEUED',
                    plannedAt: { lte: now },
                 },
                 orderBy: [{ plannedAt: 'asc' }, { createdAt: 'asc' }],
                 take: room,
                 select: {
                    id: true,
                    userId: true,
                    slug: true,
                    name: true,
                    note: true,
                 },
              })
            : Promise.resolve([]),
         db.linkedInInvite.findMany({
            where: {
               ...due,
               state: 'WITHDRAW_QUEUED',
            },
            orderBy: { invitedAt: 'asc' },
            take: INVITE_LIMITS.withdrawPerRun,
            select: {
               id: true,
               slug: true,
               name: true,
            },
         }),
      ])

      if (sends.length === 0 && withdrawals.length === 0) {
         return {
            asked: false,
            reason: paused
               ? 'Too many pending invites'
               : room === 0
                 ? 'The account used its invites for now'
                 : 'Nothing is due',
         }
      }

      // The spider refuses a whole run when one row does not fit its schema, so a row it would refuse is ended here (a profile address
      // with an accented letter, say) and the rest go. Left in the queue it would be asked for again by every run, for ever.
      const named = await this.withNames(sends)
      const ask = askable(named, withdrawals)

      await db.linkedInInvite.updateMany({
         where: {
            id: { in: ask.refusedSends.map(({ id }) => id) },
            state: 'QUEUED',
         },
         data: {
            state: 'FAILED',
            reason: UNUSABLE_INVITE_SENTENCE,
         },
      })
      await db.linkedInInvite.updateMany({
         where: {
            id: { in: ask.refusedWithdrawals.map(({ id }) => id) },
            state: 'WITHDRAW_QUEUED',
         },
         data: {
            state: 'SENT',
            reason: UNUSABLE_WITHDRAW_SENTENCE,
         },
      })

      const ready = ask.sends
      const askedWithdrawals = ask.withdrawals

      if (ready.length === 0 && askedWithdrawals.length === 0) {
         return {
            asked: false,
            reason: 'Invites that could not be used were ended',
         }
      }

      try {
         await TaskService.request({
            userId: account.userId,
            task: INVITE_TASK,
            accountId,
            trigger: 'automatic',
            input: {
               send: ready.map(sendInput),
               withdraw: askedWithdrawals,
               ...(account.notesOutUntil && account.notesOutUntil > now && { notesOut: true }),
            },
            onStart: async (sessionId, tx) => {
               const sending = await tx.linkedInInvite.updateMany({
                  where: {
                     id: { in: ready.map(({ id }) => id) },
                     state: 'QUEUED',
                  },
                  data: {
                     state: 'SENDING',
                     sessionId,
                     startedAt: now,
                     waitReason: null,
                     waitUntil: null,
                     waitZone: null,
                  },
               })

               for (const { id, name, note } of ready) {
                  await tx.linkedInInvite.update({
                     where: { id },
                     data: {
                        name,
                        note: note ?? null,
                     },
                  })
               }
               const withdrawing = await tx.linkedInInvite.updateMany({
                  where: {
                     id: { in: askedWithdrawals.map(({ id }) => id) },
                     state: 'WITHDRAW_QUEUED',
                  },
                  data: {
                     state: 'WITHDRAWING',
                     sessionId,
                  },
               })

               if (sending.count !== ready.length || withdrawing.count !== askedWithdrawals.length) {
                  throw new InvitesTaken()
               }
            },
         })

         return { asked: true }
      } catch (error) {
         if (error instanceof InvitesTaken || error instanceof TaskBusyError || error instanceof TaskUnavailableError) {
            return {
               asked: false,
               reason: error instanceof InvitesTaken ? 'Another pass took them' : 'The account is busy',
            }
         }

         if (error instanceof TaskRefusedError) {
            const budget = error instanceof BrowseBudgetError

            await this.noteWait(accountId, {
               reason: budget ? budgetWait(error.reason) : error.message,
               until: budget ? error.until : new Date(now.getTime() + REFUSED_WAIT_MS),
               zone: budget ? (error.zone ?? null) : null,
            })

            return {
               asked: false,
               reason: budget ? 'The account has no browsing time now' : 'The run was refused',
            }
         }

         throw error
      }
   }

   // What the invite-send job does: ends runs that never answered, and gives every account with something due its turn. Pending
   // invites are never withdrawn here. One item per account it asked for or left.
   public static async dispatchWaiting(now = new Date()) {
      const db = PrismaService.client
      const stale = await this.endStale(now)
      const accounts = await db.linkedInInvite.findMany({
         where: {
            OR: [
               {
                  state: 'QUEUED',
                  plannedAt: { lte: now },
               },
               { state: 'WITHDRAW_QUEUED' },
            ],
         },
         distinct: ['accountId'],
         select: {
            accountId: true,
            userId: true,
         },
         take: 100,
      })
      const items = []

      for (const { accountId, userId } of accounts) {
         const { asked, reason } = await this.dispatchNext(accountId, now)

         items.push({
            userId,
            accountId,
            action: 'invites-send',
            result: asked ? ('ASKED' as const) : ('SKIPPED' as const),
            ...(reason && { reason }),
         })
      }

      return {
         asked: items.filter(({ result }) => result === 'ASKED').length,
         stale,
         items,
      }
   }

   // Stores what a finished run did to each invite, from its file: only invites of that run, in the state its result left them.
   public static async store(sessionId: string, file: InvitesFile, now = new Date()) {
      const db = PrismaService.client
      const rows = await db.linkedInInvite.findMany({
         where: {
            sessionId,
            state: { in: ['SENDING', 'WITHDRAWING', 'UNKNOWN', 'WITHDRAW_QUEUED'] },
         },
         select: {
            id: true,
            accountId: true,
            state: true,
            tries: true,
            note: true,
         },
      })
      const byId = new Map(rows.map(row => [row.id, row]))
      let changed = 0

      await db.$transaction(async tx => {
         const apply = async (id: string, change: ReturnType<typeof sendChange>, from: LinkedInInviteState[]) => {
            const { count } = await tx.linkedInInvite.updateMany({
               where: {
                  id,
                  sessionId,
                  state: { in: from },
               },
               data: change,
            })

            changed += count
         }

         for (const { id, outcome, memberId } of file.sent) {
            const row = byId.get(id)

            if (row && (row.state === 'SENDING' || row.state === 'UNKNOWN')) {
               await apply(
                  id,
                  {
                     ...sendChange(outcome, row.tries, now, memberId),
                     ...noteSentOf(outcome, row.note),
                  },
                  ['SENDING', 'UNKNOWN']
               )
            }
         }

         for (const { id, outcome } of file.withdrawn) {
            const row = byId.get(id)

            if (row && (row.state === 'WITHDRAWING' || row.state === 'WITHDRAW_QUEUED')) {
               await apply(id, withdrawChange(outcome, row.tries, now), ['WITHDRAWING', 'WITHDRAW_QUEUED'])
            }
         }

         // LinkedIn refused a note: the account's later invites go without one until its notes come back.
         const notesOut = new Set(
            file.sent.flatMap(({ id, outcome }) =>
               outcome === 'SENT_WITHOUT_NOTE' ? (byId.get(id)?.accountId ?? []) : []
            )
         )

         if (notesOut.size > 0) {
            await tx.linkedInAccount.updateMany({
               where: { id: { in: [...notesOut] } },
               data: { notesOutUntil: notesBackAt(now) },
            })
         }
      })

      return changed
   }

   // New connections of an account: the invites it sent them are accepted. Slugs are compared as LinkedIn may write them.
   public static async markAccepted(accountId: string, slugs: string[], now = new Date()) {
      if (slugs.length === 0) {
         return 0
      }

      const keys = new Set(slugs.map(slugKey))
      const open = await PrismaService.client.linkedInInvite.findMany({
         where: {
            accountId,
            state: { in: [...PENDING, 'WITHDRAWING'] },
         },
         select: {
            id: true,
            slug: true,
         },
      })
      const ids = open.filter(({ slug }) => keys.has(slugKey(slug))).map(({ id }) => id)

      if (ids.length === 0) {
         return 0
      }

      const { count } = await PrismaService.client.linkedInInvite.updateMany({
         where: { id: { in: ids } },
         data: {
            state: 'ACCEPTED',
            acceptedAt: now,
            reason: null,
         },
      })

      return count
   }

   // The newest stored connections of an account, for a read that stops at the first of them.
   public static async newestConnections(accountId: string) {
      const rows = await PrismaService.client.linkedInConnection.findMany({
         where: {
            accountId,
            status: 'CONNECTED',
         },
         orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
         take: 50,
         select: { slug: true },
      })

      return rows.map(({ slug }) => slug)
   }

   // Runs asked for long ago and never answered were lost with them: an invite may have gone, so it is unsure, never sent again; a
   // withdrawal is simply tried again.
   public static async endStale(now = new Date()) {
      const db = PrismaService.client
      const before = new Date(now.getTime() - STALE_MS)
      const sending = await db.linkedInInvite.updateMany({
         where: {
            state: 'SENDING',
            startedAt: { lt: before },
         },
         data: {
            state: 'UNKNOWN',
            reason: STALE_SENTENCE,
         },
      })
      const withdrawing = await db.linkedInInvite.findMany({
         where: { state: 'WITHDRAWING' },
         distinct: ['sessionId'],
         select: { sessionId: true },
         take: 100,
      })
      const lost = await db.spiderSession.findMany({
         where: {
            id: { in: withdrawing.flatMap(({ sessionId }) => (sessionId ? [sessionId] : [])) },
            startedAt: { lt: before },
         },
         select: { id: true },
      })
      const back = await db.linkedInInvite.updateMany({
         where: {
            state: 'WITHDRAWING',
            sessionId: { in: lost.map(({ id }) => id) },
         },
         data: { state: 'WITHDRAW_QUEUED' },
      })

      return sending.count + back.count
   }

   // The account's invites of the last 7 days (by when their run was asked for) and the ones waiting, for planning.
   private static async usage(accountId: string, now: Date, tx: Prisma.TransactionClient = PrismaService.client) {
      const [started, planned] = await Promise.all([
         tx.linkedInInvite.findMany({
            where: {
               accountId,
               state: { in: COUNTED },
               startedAt: { gte: new Date(now.getTime() - WEEK_MS) },
            },
            select: { startedAt: true },
         }),
         tx.linkedInInvite.findMany({
            where: {
               accountId,
               state: 'QUEUED',
            },
            select: { plannedAt: true },
         }),
      ])

      return {
         started: started.flatMap(({ startedAt }) => (startedAt ? [startedAt] : [])),
         planned: planned.map(({ plannedAt }) => plannedAt),
      }
   }

   // The account's own invite limits of the day (limits.ts); an account that is gone has no room.
   private static async limitsOf(accountId: string, now: Date) {
      const limits = await AccountLimitsService.forAccount(accountId, ['invitesPerDay', 'invitesPerWeek'], now)

      return {
         perDay: limits?.invitesPerDay ?? 0,
         perWeek: limits?.invitesPerWeek ?? 0,
      }
   }

   // Invites of the account sent and not answered; they never expire here, so the count only grows until people answer.
   private static pendingOf(accountId: string) {
      return PrismaService.client.linkedInInvite.count({
         where: {
            accountId,
            state: { in: PENDING },
         },
      })
   }

   // The accounts whose new invites are not paused by too many pending ones.
   private static async notPaused<T extends { id: string }>(accounts: T[]) {
      const levels = await Promise.all(accounts.map(async ({ id }) => pendingLevel(await this.pendingOf(id))))

      return accounts.filter((_, index) => levels[index] !== 'paused')
   }

   // How many invites an account may plan for today, by the planner's own numbers, how many fit inside `days` days, and its limit of
   // the day. An account with too many pending invites has none.
   public static async roomToday(accountId: string, now = new Date(), days = 1) {
      const [limits, usage, pending] = await Promise.all([
         this.limitsOf(accountId, now),
         this.usage(accountId, now),
         this.pendingOf(accountId),
      ])
      const paused = pendingLevel(pending) === 'paused'
      const { today, times } = planInvites({
         now,
         ...usage,
         count: limits.perDay * days,
         limits,
         days,
      })

      return {
         left: paused ? 0 : today,
         within: paused ? 0 : times.length,
         limit: limits.perDay,
         paused,
      }
   }

   // The account with the most room today, so an owner with several accounts spreads the invites.
   private static async roomiest(accounts: Account[], now: Date) {
      let best: { account: Account; today: number } | undefined

      for (const account of accounts) {
         const { today } = planInvites({
            now,
            ...(await this.usage(account.id, now)),
            count: 0,
            limits: await this.limitsOf(account.id, now),
         })

         if (!best || today > best.today) {
            best = {
               account,
               today,
            }
         }
      }

      return best?.account
   }

   // Summed daily and weekly invite limits of the accounts that can send now (same rules as dispatch).
   public static async usableCapacityOf(userId: string, now = new Date()) {
      const accounts = await this.accountsOf(userId)
      const open = (await this.notPaused(accounts)).filter(account => !stopped(account, now))
      const limits = await Promise.all(open.map(({ id }) => this.limitsOf(id, now)))

      return {
         perDay: limits.reduce((total, { perDay }) => total + perDay, 0),
         perWeek: limits.reduce((total, { perWeek }) => total + perWeek, 0),
         usableAccounts: open.length,
      }
   }

   private static skipCounts(facts: Array<{ skip: SkipReason | undefined }>) {
      return facts.reduce<Partial<Record<SkipReason, number>>>(
         (counts, { skip }) =>
            skip
               ? {
                    ...counts,
                    [skip]: (counts[skip] ?? 0) + 1,
                 }
               : counts,
         {}
      )
   }

   // Queued invites that must not go any more: their person went on Do not contact.
   private static async dropUnwanted(accountId: string, userId: string) {
      const db = PrismaService.client
      const queued = await db.linkedInInvite.findMany({
         where: {
            accountId,
            state: 'QUEUED',
         },
         select: {
            id: true,
            slug: true,
         },
         take: 200,
      })

      if (queued.length === 0) {
         return
      }

      const slugs = queued.map(({ slug }) => slug)
      const [suppressed, blockedPeople] = await Promise.all([
         db.suppression.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: { slug: true },
         }),
         db.person.findMany({
            where: {
               userId,
               slug: { in: slugs },
               doNotContact: true,
            },
            select: { slug: true },
         }),
      ])
      const blocked = new Set([...suppressed, ...blockedPeople].map(({ slug }) => slug))
      const unwanted = queued.filter(({ slug }) => blocked.has(slug)).map(({ id }) => id)

      if (unwanted.length > 0) {
         await db.linkedInInvite.updateMany({
            where: {
               id: { in: unwanted },
               state: 'QUEUED',
            },
            data: {
               state: 'SKIPPED',
               reason: BLOCKED_SENTENCE,
            },
         })
      }
   }

   // Why the account's queued invites have not started and the earliest they may, for the page.
   private static async noteWait(accountId: string, wait: { reason: string | null; until: Date; zone: string | null }) {
      await PrismaService.client.linkedInInvite.updateMany({
         where: {
            accountId,
            state: { in: ['QUEUED', 'WITHDRAW_QUEUED'] },
         },
         data: {
            waitReason: wait.reason,
            waitUntil: wait.until,
            waitZone: wait.zone,
         },
      })
   }
}
