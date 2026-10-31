import { type LinkedInInviteState, type Prisma } from 'generated/prisma/client'

import { INVITE_LIMITS, type InvitesFile } from '@automatedLinkedIn/contracts'

import { ClientService } from './client.service'
import {
   COUNTED,
   LIVE,
   PENDING,
   type SkipReason,
   fillNote,
   inviteSentence,
   notesBackAt,
   planInvites,
   sendChange,
   skipReasonOf,
   withdrawChange,
} from './inviteRules'
import { INVITE_TASK } from './linkedInInvite.hooks'
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
const MOVED_SENTENCE = 'The account moved to another client. Nothing was sent.'
const BLOCKED_SENTENCE = 'On Do not contact. Nothing was sent.'

const SKIP_SENTENCES: Record<SkipReason, string> = {
   DO_NOT_CONTACT: 'On Do not contact.',
   CONNECTED: 'Already connected.',
   REQUEST: 'A connection request is pending.',
   INVITED: `Invited in the last ${INVITE_LIMITS.pendingDays / 7} weeks.`,
}

// Another process took the invites first: they stay as it left them.
class InvitesTaken extends Error {}

export type InviteRequest = {
   clientId: string
   personIds: string[]
   // The account that sends; may be left out when the client has one signed-in account.
   accountId?: string
   note?: string
   // The Found by source the owner was looking at, credited with the accepts.
   source?: string
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
// up to 5, withdrawn after 3 weeks, and marked accepted by the reads of the newest connections. Every call is scoped to the owner.
export class LinkedInInviteService {
   // The signed-in accounts of a client that can send, with what each may still send today. Null when the client is not the owner's.
   private static async accountsOf(userId: string, clientId: string) {
      const client = await PrismaService.client.client.findFirst({
         where: {
            id: clientId,
            userId,
         },
         select: {
            id: true,
            isDefault: true,
         },
      })

      if (!client) {
         return null
      }

      return PrismaService.client.linkedInAccount.findMany({
         where: {
            userId,
            status: 'ACTIVE',
            ...(client.isDefault ? { OR: [{ clientId: null }, { clientId }] } : { clientId }),
         },
         orderBy: { createdAt: 'asc' },
         select: {
            id: true,
            email: true,
            displayName: true,
         },
      })
   }

   // The due invites with the name My network has now and their note filled in from it (an address-named invite gets the name a
   // read brought since). A person no longer in the client keeps the invite's own name.
   private static async withNames(
      sends: Array<{ id: string; clientId: string; slug: string; name: string; note: string | null }>
   ) {
      const people = await PrismaService.client.person.findMany({
         where: {
            OR: sends.map(({ clientId, slug }) => ({
               clientId,
               slug,
            })),
         },
         select: {
            clientId: true,
            slug: true,
            name: true,
            company: true,
         },
      })
      const personOf = new Map(people.map(person => [`${person.clientId}:${person.slug}`, person]))

      return sends.map(invite => {
         const person = personOf.get(`${invite.clientId}:${invite.slug}`)
         const name = person?.name ?? invite.name

         return {
            id: invite.id,
            slug: invite.slug,
            name,
            note: fillNote(invite.note ?? undefined, {
               name: name === invite.slug ? null : name,
               company: person?.company ?? null,
            }),
         }
      })
   }

   // Why each picked person would be skipped, or not; only people of the client count.
   private static async facts(userId: string, clientId: string, personIds: string[], now: Date) {
      const db = PrismaService.client
      const people = await db.person.findMany({
         where: {
            id: { in: personIds },
            userId,
            clientId,
         },
         select: {
            id: true,
            slug: true,
            name: true,
            company: true,
            doNotContact: true,
            foundBy: true,
         },
      })
      const slugs = people.map(({ slug }) => slug)
      const [suppressed, requests, invites] = await Promise.all([
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
               clientId,
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
      ])
      const blocked = new Set(suppressed.map(({ slug }) => slug))
      const asked = new Set(requests.map(({ slug }) => slug))
      const invited = new Set(invites.map(({ slug }) => slug))

      return people.map(person => ({
         person,
         skip: skipReasonOf({
            doNotContact: person.doNotContact || blocked.has(person.slug),
            connected: person.foundBy.includes('connection'),
            requestPending: asked.has(person.slug),
            invitedRecently: invited.has(person.slug),
         }),
      }))
   }

   // What inviting these people would do, without doing it: the account that sends, the sentence, and the counts. Null when the client
   // is not the owner's.
   public static async plan(userId: string, request: Omit<InviteRequest, 'note' | 'source'>, now = new Date()) {
      const accounts = await this.accountsOf(userId, request.clientId)

      if (!accounts) {
         return null
      }

      const account = accounts.find(({ id }) => id === request.accountId) ?? (await this.roomiest(accounts, now))

      if (!account) {
         throw new TaskRefusedError('Inviting needs a signed-in account of this client. Run Test login first.')
      }

      const facts = await this.facts(userId, request.clientId, request.personIds, now)
      const skipped = this.skipCounts(facts)
      const toInvite = facts.filter(({ skip }) => skip === undefined).length
      const unnamed = facts.filter(({ person, skip }) => skip === undefined && !person.name).length
      const { today, times } = planInvites({
         now,
         ...(await this.usage(account.id, now)),
         count: toInvite,
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
   // why, and what 14 days cannot hold is left out. Null when the client is not the owner's.
   public static async invite(userId: string, request: InviteRequest, now = new Date()) {
      const plan = await this.plan(userId, request, now)

      if (!plan) {
         return null
      }

      const { accountId } = plan
      const facts = await this.facts(userId, request.clientId, request.personIds, now)
      const db = PrismaService.client
      const queued = await db.$transaction(async tx => {
         // The account row is locked so two requests at once plan from the same counts.
         await tx.$queryRaw`SELECT "id" FROM "LinkedInAccount" WHERE "id" = ${accountId} FOR UPDATE`

         const wanted = facts.filter(({ skip }) => skip === undefined)
         const { times } = planInvites({
            now,
            ...(await this.usage(accountId, now, tx)),
            count: wanted.length,
         })
         const rows = wanted.slice(0, times.length).map(({ person }, index) => ({
            userId,
            clientId: request.clientId,
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
                          clientId: request.clientId,
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

         return made.count
      })

      return {
         queued,
         skipped: plan.skipped,
         sentence: plan.sentence,
      }
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

   // The invites of one person in a client, newest first, for the drawer.
   public static async ofPerson(userId: string, personId: string) {
      const person = await PrismaService.client.person.findFirst({
         where: {
            id: personId,
            userId,
         },
         select: {
            clientId: true,
            slug: true,
         },
      })

      if (!person) {
         return null
      }

      return PrismaService.client.linkedInInvite.findMany({
         where: {
            clientId: person.clientId,
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
            clientId: true,
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

      await this.dropUnwanted(
         accountId,
         account.userId,
         account.clientId ?? (await ClientService.defaultId(account.userId))
      )

      const { started } = await this.usage(accountId, now)
      const day = started.filter(at => at.getTime() > now.getTime() - DAY_MS).length
      const room = Math.max(
         0,
         Math.min(INVITE_LIMITS.perRun, INVITE_LIMITS.perDay - day, INVITE_LIMITS.perWeek - started.length)
      )
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
                    clientId: true,
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
            reason: room === 0 ? 'The account used its invites for now' : 'Nothing is due',
         }
      }

      const ready = await this.withNames(sends)

      try {
         await TaskService.request({
            userId: account.userId,
            task: INVITE_TASK,
            accountId,
            trigger: 'automatic',
            input: {
               send: ready.map(({ id, slug, name, note }) => ({
                  id,
                  slug,
                  name,
                  ...(note && { note }),
               })),
               withdraw: withdrawals,
               ...(account.notesOutUntil && account.notesOutUntil > now && { notesOut: true }),
            },
            onStart: async (sessionId, tx) => {
               const sending = await tx.linkedInInvite.updateMany({
                  where: {
                     id: { in: sends.map(({ id }) => id) },
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
                     id: { in: withdrawals.map(({ id }) => id) },
                     state: 'WITHDRAW_QUEUED',
                  },
                  data: {
                     state: 'WITHDRAWING',
                     sessionId,
                  },
               })

               if (sending.count !== sends.length || withdrawing.count !== withdrawals.length) {
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

   // What the invite-send job does: moves invites pending 3 weeks to be withdrawn, ends runs that never answered, and gives every
   // account with something due its turn. One item per account it asked for or left.
   public static async dispatchWaiting(now = new Date()) {
      const db = PrismaService.client
      const old = new Date(now.getTime() - PENDING_MS)
      const [withdraw, stale] = await Promise.all([
         db.linkedInInvite.updateMany({
            where: {
               OR: [
                  {
                     state: 'SENT',
                     invitedAt: { lt: old },
                  },
                  {
                     state: 'UNKNOWN',
                     startedAt: { lt: old },
                  },
               ],
            },
            data: {
               state: 'WITHDRAW_QUEUED',
               tries: 0,
            },
         }),
         this.endStale(now),
      ])
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
         withdraw: withdraw.count,
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
               await apply(id, sendChange(outcome, row.tries, now, memberId), ['SENDING', 'UNKNOWN'])
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

   // The account with the most room today, so a client with several accounts spreads its invites.
   private static async roomiest(accounts: Account[], now: Date) {
      let best: { account: Account; today: number } | undefined

      for (const account of accounts) {
         const { today } = planInvites({
            now,
            ...(await this.usage(account.id, now)),
            count: 0,
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

   // Queued invites that must not go any more: their person went on Do not contact, or their account moved to another client.
   private static async dropUnwanted(accountId: string, userId: string, clientId: string) {
      const db = PrismaService.client
      const queued = await db.linkedInInvite.findMany({
         where: {
            accountId,
            state: 'QUEUED',
         },
         select: {
            id: true,
            slug: true,
            clientId: true,
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
            select: {
               slug: true,
               clientId: true,
            },
         }),
      ])
      const blocked = (invite: { slug: string; clientId: string }) =>
         suppressed.some(({ slug }) => slug === invite.slug) ||
         blockedPeople.some(person => person.slug === invite.slug && person.clientId === invite.clientId)
      const moved = queued.filter(invite => invite.clientId !== clientId).map(({ id }) => id)
      const unwanted = queued.filter(invite => invite.clientId === clientId && blocked(invite)).map(({ id }) => id)

      if (moved.length > 0) {
         await db.linkedInInvite.updateMany({
            where: {
               id: { in: moved },
               state: 'QUEUED',
            },
            data: {
               state: 'SKIPPED',
               reason: MOVED_SENTENCE,
            },
         })
      }

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
