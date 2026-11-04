import { type Prisma } from 'generated/prisma/client'

import { ENGAGE_LIMITS, ENGAGE_TASK, type EngageFile, type Reaction, engagePostOf } from '@automatedLinkedIn/contracts'

import { AccountRoomService, roomLeft } from './accountRoom.service'
import { ENGAGE_REASONS, postTooOld, reactionFor, waitAfterAct } from './engageRules'
import { PENDING } from './inviteRules'
import { PlatformSettingService } from './platformSetting.service'
import { budgetWait } from './postPublication.rules'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { BrowseBudgetError, TaskBusyError, TaskRefusedError, TaskUnavailableError } from './taskErrors'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
// A refusal that is not about browsing time is tried again after this.
const REFUSED_WAIT_MS = 30 * MINUTE_MS
// The acts a person was reached by: the ones that count for the gap between two acts.
const LIVE = ['QUEUED', 'SENDING', 'DONE', 'UNKNOWN'] as const

export type EngageOrigin = { workflowId: string; runId: string; nodeId: string }

// A post of a person an act may be made on: what the block knows of it.
export type EngageCandidate = {
   slug: string
   postUrl: string
   authorName: string | null
   authorHeadline: string | null
   excerpt: string | null
   postedAt: Date | null
}

export type EngageWish = { act: 'REACT'; reactions: Reaction[] } | { act: 'COMMENT'; words: string }

// Where the acts come from: the account that sent the author's pending invite, or one of the chosen accounts (the one with most room).
export type EngageAccounts = { mode: 'inviter' } | { mode: 'chosen'; ids: string[] }

export type EngageRequest = {
   accounts: EngageAccounts
   candidates: EngageCandidate[]
   wish: EngageWish
   // Days between two acts on one person, before the stable extra of up to a day.
   daysApart: number
   origin?: EngageOrigin
   // Decide and say, queue nothing: a preview.
   dryRun?: boolean
}

export type EngageOutcome = {
   status: 'PLANNED' | 'SKIPPED'
   reason: string | null
   accountId: string | null
   reaction: Reaction | null
}

const skipped = (reason: string): EngageOutcome => ({
   status: 'SKIPPED',
   reason,
   accountId: null,
   reaction: null,
})

// Whether an account's engaging is stopped now: until a time, or until a sign-in after it stopped.
const stopped = (
   account: { engageStoppedAt: Date | null; engageStopUntil: Date | null; lastVerifiedAt: Date | null },
   now: Date
) => {
   if (!account.engageStoppedAt) {
      return false
   }

   return account.engageStopUntil
      ? account.engageStopUntil > now
      : !(account.lastVerifiedAt && account.lastVerifiedAt > account.engageStoppedAt)
}

const lastActOf = (row: { doneAt: Date | null; startedAt: Date | null; plannedAt: Date }) =>
   row.doneAt ?? row.startedAt ?? row.plannedAt

// Reactions and comments of the owner's accounts on people's posts, planned inside each account's daily limit and sent by `linkedin-engage`
// runs of up to 10 (.plan/lead-pipeline-p3-engage.md). This service keeps the limits; a block never raises one. Every call is scoped to the
// owner. The task is not built yet: until the spider announces it, runs are refused as unavailable and the acts wait.
export class LinkedInEngageService {
   // What would happen to each post, and queues the acts that can go. Answers by `postUrl`.
   public static async plan(
      userId: string,
      request: EngageRequest,
      now = new Date()
   ): Promise<Map<string, EngageOutcome>> {
      const out = new Map<string, EngageOutcome>()
      const { candidates, wish } = request

      if (!(await PlatformSettingService.actsOn())) {
         candidates.forEach(({ postUrl }) => out.set(postUrl, skipped(ENGAGE_REASONS.PAUSED)))

         return out
      }

      const db = PrismaService.client
      const posts = new Map(candidates.map(candidate => [candidate.postUrl, engagePostOf(candidate.postUrl)]))
      const slugs = [...new Set(candidates.map(({ slug }) => slug))]
      const keys = [...new Set([...posts.values()].flatMap(post => (post ? [post.key] : [])))]
      const inviter = request.accounts.mode === 'inviter'
      const [invites, accounts, people, suppressed, existing, recent] = await Promise.all([
         inviter
            ? db.linkedInInvite.findMany({
                 where: {
                    userId,
                    slug: { in: slugs },
                    state: { in: [...PENDING] },
                 },
                 orderBy: { invitedAt: 'desc' },
                 select: {
                    slug: true,
                    accountId: true,
                 },
              })
            : [],
         db.linkedInAccount.findMany({
            where: {
               userId,
               ...(request.accounts.mode === 'chosen' && { id: { in: request.accounts.ids } }),
            },
            select: {
               id: true,
               status: true,
               lastVerifiedAt: true,
               engageStoppedAt: true,
               engageStopUntil: true,
            },
         }),
         db.person.findMany({
            where: {
               userId,
               slug: { in: slugs },
               doNotContact: true,
            },
            select: { slug: true },
         }),
         db.suppression.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: { slug: true },
         }),
         db.postAct.findMany({
            where: {
               userId,
               postKey: { in: keys },
               act: wish.act,
            },
            select: { postKey: true },
         }),
         db.postAct.findMany({
            where: {
               userId,
               slug: { in: slugs },
               state: { in: [...LIVE] },
            },
            select: {
               slug: true,
               doneAt: true,
               startedAt: true,
               plannedAt: true,
            },
         }),
      ])
      const accountOf = new Map(accounts.map(account => [account.id, account]))
      const inviterOf = new Map<string, string>()

      for (const { slug, accountId } of invites) {
         if (!inviterOf.has(slug)) {
            inviterOf.set(slug, accountId)
         }
      }

      const usable = accounts.filter(({ status }) => status === 'ACTIVE')
      const rooms = await AccountRoomService.forAccounts(
         accounts.map(({ id }) => id),
         now
      )
      const left = new Map(
         accounts.map(({ id }) => {
            const room = rooms.get(id)

            return [id, room ? roomLeft(wish.act === 'REACT' ? room.reactions : room.comments) : 0] as const
         })
      )
      const blocked = new Set([...people, ...suppressed].map(({ slug }) => slug))
      const taken = new Set(existing.map(({ postKey }) => postKey))
      const lastBy = new Map<string, Date>()

      for (const row of recent) {
         const at = lastActOf(row)
         const known = lastBy.get(row.slug)

         if (!known || at > known) {
            lastBy.set(row.slug, at)
         }
      }

      const queue: Prisma.PostActCreateManyInput[] = []

      for (const candidate of candidates) {
         const post = posts.get(candidate.postUrl)
         const chosen = inviter
            ? inviterOf.get(candidate.slug)
            : [...usable.map(({ id }) => id)].sort((a, b) => (left.get(b) ?? 0) - (left.get(a) ?? 0))[0]
         const account = chosen ? accountOf.get(chosen) : undefined
         const last = lastBy.get(candidate.slug)

         if (!post) {
            out.set(candidate.postUrl, skipped(ENGAGE_REASONS.BAD_LINK))
         } else if (!chosen) {
            out.set(candidate.postUrl, skipped(inviter ? ENGAGE_REASONS.NO_INVITE : ENGAGE_REASONS.NOT_SIGNED_IN))
         } else if (!account || account.status !== 'ACTIVE') {
            out.set(candidate.postUrl, skipped(ENGAGE_REASONS.NOT_SIGNED_IN))
         } else if (stopped(account, now)) {
            out.set(candidate.postUrl, skipped(ENGAGE_REASONS.STOPPED))
         } else if (blocked.has(candidate.slug)) {
            out.set(candidate.postUrl, skipped(ENGAGE_REASONS.DO_NOT_CONTACT))
         } else if (postTooOld(candidate.postedAt, now)) {
            out.set(candidate.postUrl, skipped(ENGAGE_REASONS.TOO_OLD))
         } else if (taken.has(post.key)) {
            out.set(
               candidate.postUrl,
               skipped(wish.act === 'REACT' ? ENGAGE_REASONS.ALREADY_REACTED : ENGAGE_REASONS.ALREADY_COMMENTED)
            )
         } else if (last && now.getTime() - last.getTime() < waitAfterAct(candidate.slug, request.daysApart)) {
            out.set(candidate.postUrl, skipped(ENGAGE_REASONS.NOT_DUE))
         } else if ((left.get(account.id) ?? 0) <= 0) {
            out.set(candidate.postUrl, skipped(ENGAGE_REASONS.NO_ROOM))
         } else {
            const reaction = wish.act === 'REACT' ? reactionFor(post.key, wish.reactions) : null

            taken.add(post.key)
            lastBy.set(candidate.slug, now)
            left.set(account.id, (left.get(account.id) ?? 0) - 1)
            out.set(candidate.postUrl, {
               status: 'PLANNED',
               reason: null,
               accountId: account.id,
               reaction,
            })
            queue.push({
               userId,
               accountId: account.id,
               slug: candidate.slug,
               postKey: post.key,
               postUrl: post.link,
               authorName: candidate.authorName,
               authorHeadline: candidate.authorHeadline?.slice(0, 300) ?? null,
               excerpt: candidate.excerpt?.slice(0, 500) ?? null,
               postedAt: candidate.postedAt,
               act: wish.act,
               reaction,
               words: wish.act === 'COMMENT' ? wish.words : null,
               plannedAt: now,
               ...(request.origin && {
                  originWorkflowId: request.origin.workflowId,
                  originRunId: request.origin.runId,
                  originNodeId: request.origin.nodeId,
               }),
            })
         }
      }

      if (!request.dryRun && queue.length > 0) {
         await this.queue(queue, out, candidates, wish.act)
      }

      return out
   }

   // Saves the acts; a post another pass took first (the unique key) is reported as already done.
   private static async queue(
      rows: Prisma.PostActCreateManyInput[],
      out: Map<string, EngageOutcome>,
      candidates: EngageCandidate[],
      act: 'REACT' | 'COMMENT'
   ) {
      for (const row of rows) {
         const { count } = await PrismaService.client.postAct.createMany({
            data: [row],
            skipDuplicates: true,
         })

         if (count === 0) {
            const candidate = candidates.find(({ postUrl }) => engagePostOf(postUrl)?.key === row.postKey)

            if (candidate) {
               out.set(
                  candidate.postUrl,
                  skipped(act === 'REACT' ? ENGAGE_REASONS.ALREADY_REACTED : ENGAGE_REASONS.ALREADY_COMMENTED)
               )
            }
         }
      }
   }

   // Starts the account's next run when it may: signed in, engaging not stopped, the switch on, no run of its acts going, and room. A run
   // asks for up to 10 acts, at most 3 comments, oldest first. Resolves to what happened, for the job's log.
   public static async dispatchNext(accountId: string, now = new Date()): Promise<{ asked: boolean; reason?: string }> {
      const db = PrismaService.client
      const account = await db.linkedInAccount.findUnique({
         where: { id: accountId },
         select: {
            userId: true,
            status: true,
            lastVerifiedAt: true,
            engageStoppedAt: true,
            engageStopUntil: true,
         },
      })

      if (!(await PlatformSettingService.actsOn())) {
         return {
            asked: false,
            reason: 'Acts are paused by the admin',
         }
      }

      if (account?.status !== 'ACTIVE') {
         return {
            asked: false,
            reason: 'The account is not signed in',
         }
      }

      if (stopped(account, now)) {
         return {
            asked: false,
            reason: 'Engaging of the account is stopped',
         }
      }

      const busy = await db.postAct.count({
         where: {
            accountId,
            state: 'SENDING',
         },
      })

      if (busy > 0) {
         return {
            asked: false,
            reason: 'A run of the account is going',
         }
      }

      await this.cancelUnwanted(accountId, account.userId, now)

      const room = (await AccountRoomService.forAccounts([accountId], now)).get(accountId)
      // What is queued counts as used in the room; the run takes from the queue, so only what was pressed in 24 hours is subtracted here.
      const pressed = await db.postAct.groupBy({
         by: ['act'],
         where: {
            accountId,
            state: { in: ['SENDING', 'DONE', 'UNKNOWN'] },
            startedAt: { gte: new Date(now.getTime() - DAY_MS) },
         },
         _count: { _all: true },
      })
      const pressedOf = (act: 'REACT' | 'COMMENT') => pressed.find(row => row.act === act)?._count._all ?? 0
      const reactRoom = Math.max(0, (room?.reactions.limit ?? 0) - pressedOf('REACT'))
      const commentRoom = Math.max(0, (room?.comments.limit ?? 0) - pressedOf('COMMENT'))
      const due = await db.postAct.findMany({
         where: {
            accountId,
            state: 'QUEUED',
            plannedAt: { lte: now },
            OR: [{ waitUntil: null }, { waitUntil: { lte: now } }],
         },
         orderBy: [{ plannedAt: 'asc' }, { createdAt: 'asc' }],
         take: 100,
         select: {
            id: true,
            act: true,
            postUrl: true,
            reaction: true,
            words: true,
            authorName: true,
         },
      })
      let reacts = reactRoom
      let comments = Math.min(commentRoom, ENGAGE_LIMITS.commentsPerRun)
      const picked = due
         .filter(row => {
            if (row.act === 'REACT') {
               reacts -= 1

               return reacts >= 0
            }

            comments -= 1

            return comments >= 0
         })
         .slice(0, ENGAGE_LIMITS.perRun)

      if (picked.length === 0) {
         return {
            asked: false,
            reason: due.length > 0 ? 'The account used its acts for now' : 'Nothing is due',
         }
      }

      try {
         await TaskService.request({
            userId: account.userId,
            task: ENGAGE_TASK,
            accountId,
            trigger: 'automatic',
            input: {
               acts: picked.map(row => ({
                  id: row.id,
                  kind: row.act === 'REACT' ? 'react' : 'comment',
                  postUrl: row.postUrl,
                  ...(row.reaction && { reaction: row.reaction }),
                  ...(row.act === 'COMMENT' && row.words && { text: row.words }),
                  ...(row.authorName && { authorName: row.authorName }),
               })),
            },
            onStart: async (sessionId, tx) => {
               const { count } = await tx.postAct.updateMany({
                  where: {
                     id: { in: picked.map(({ id }) => id) },
                     state: 'QUEUED',
                  },
                  data: {
                     state: 'SENDING',
                     sessionId,
                     startedAt: now,
                     waitReason: null,
                     waitUntil: null,
                  },
               })

               if (count !== picked.length) {
                  throw new ActsTaken()
               }
            },
         })

         return { asked: true }
      } catch (error) {
         if (error instanceof ActsTaken || error instanceof TaskBusyError || error instanceof TaskUnavailableError) {
            return {
               asked: false,
               reason:
                  error instanceof ActsTaken
                     ? 'Another pass took them'
                     : error instanceof TaskUnavailableError
                       ? 'The engage task is not available yet'
                       : 'The account is busy',
            }
         }

         if (error instanceof TaskRefusedError) {
            const budget = error instanceof BrowseBudgetError

            await db.postAct.updateMany({
               where: {
                  id: { in: picked.map(({ id }) => id) },
                  state: 'QUEUED',
               },
               data: {
                  waitReason: budget ? budgetWait(error.reason) : error.message,
                  waitUntil: budget ? error.until : new Date(now.getTime() + REFUSED_WAIT_MS),
               },
            })

            return {
               asked: false,
               reason: budget ? 'The account has no browsing time now' : 'The run was refused',
            }
         }

         throw error
      }
   }

   // What the engage-send job does: ends runs that never answered, lets old acts expire, and gives every account with something due its
   // turn. One item per account it asked for or left.
   public static async dispatchWaiting(now = new Date()) {
      const stale = await this.endStale(now)
      const expired = await this.expire(now)
      const accounts = await PrismaService.client.postAct.findMany({
         where: {
            state: 'QUEUED',
            plannedAt: { lte: now },
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
            action: 'engage-send',
            result: asked ? ('ASKED' as const) : ('SKIPPED' as const),
            ...(reason && { reason }),
         })
      }

      return {
         asked: items.filter(({ result }) => result === 'ASKED').length,
         stale,
         expired,
         items,
      }
   }

   // Acts that cannot go any more: their person went on Do not contact, or accepted the invite after the act was planned. Warm-up stops
   // on accept.
   private static async cancelUnwanted(accountId: string, userId: string, now: Date) {
      const db = PrismaService.client
      const queued = await db.postAct.findMany({
         where: {
            accountId,
            state: 'QUEUED',
         },
         select: {
            id: true,
            slug: true,
            plannedAt: true,
         },
         take: 200,
      })

      if (queued.length === 0) {
         return
      }

      const slugs = [...new Set(queued.map(({ slug }) => slug))]
      const [people, suppressed, accepted] = await Promise.all([
         db.person.findMany({
            where: {
               userId,
               slug: { in: slugs },
               doNotContact: true,
            },
            select: { slug: true },
         }),
         db.suppression.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: { slug: true },
         }),
         db.linkedInInvite.findMany({
            where: {
               userId,
               slug: { in: slugs },
               state: 'ACCEPTED',
               acceptedAt: { not: null },
            },
            select: {
               slug: true,
               acceptedAt: true,
            },
         }),
      ])
      const blocked = new Set([...people, ...suppressed].map(({ slug }) => slug))

      for (const act of queued) {
         const reason = blocked.has(act.slug)
            ? ENGAGE_REASONS.DO_NOT_CONTACT
            : accepted.some(({ slug, acceptedAt }) => slug === act.slug && acceptedAt && acceptedAt >= act.plannedAt)
              ? ENGAGE_REASONS.ACCEPTED
              : null

         if (reason) {
            await db.postAct.updateMany({
               where: {
                  id: act.id,
                  state: 'QUEUED',
               },
               data: {
                  state: 'CANCELLED',
                  reason,
                  doneAt: now,
               },
            })
         }
      }
   }

   // Runs asked for long ago and never answered were lost with them: an act may have gone, so it is unsure, never sent again.
   public static async endStale(now = new Date()) {
      const { count } = await PrismaService.client.postAct.updateMany({
         where: {
            state: 'SENDING',
            startedAt: { lt: new Date(now.getTime() - ENGAGE_LIMITS.staleMinutes * MINUTE_MS) },
         },
         data: {
            state: 'UNKNOWN',
            reason: ENGAGE_REASONS.NOT_ANSWERED,
         },
      })

      return count
   }

   // An act that waited too long is left: the post is no longer new.
   public static async expire(now = new Date()) {
      const { count } = await PrismaService.client.postAct.updateMany({
         where: {
            state: 'QUEUED',
            plannedAt: { lt: new Date(now.getTime() - ENGAGE_LIMITS.queuedDays * DAY_MS) },
         },
         data: {
            state: 'EXPIRED',
            reason: ENGAGE_REASONS.EXPIRED,
         },
      })

      return count
   }

   // Stores what a finished run did to each act, from its file: only acts of that run, in the state its outcome says. An act the run
   // did not try goes back in the queue; one that was pressed and not shown is unsure and never sent again.
   public static async store(sessionId: string, file: EngageFile, now = new Date()) {
      const db = PrismaService.client
      const rows = await db.postAct.findMany({
         where: {
            sessionId,
            state: { in: ['SENDING', 'UNKNOWN'] },
         },
         select: {
            id: true,
            accountId: true,
         },
      })
      const byId = new Map(rows.map(row => [row.id, row]))
      let changed = 0
      const refused = new Set<string>()

      await db.$transaction(async tx => {
         for (const { id, outcome } of file.acts) {
            const row = byId.get(id)

            if (!row) {
               continue
            }

            const { count } = await tx.postAct.updateMany({
               where: {
                  id,
                  sessionId,
                  state: { in: ['SENDING', 'UNKNOWN'] },
               },
               data: changeOf(outcome, now),
            })

            changed += count

            if (outcome === 'REFUSED') {
               refused.add(row.accountId)
            }
         }

         // LinkedIn refused: the account's engaging stops for a day.
         if (refused.size > 0) {
            await tx.linkedInAccount.updateMany({
               where: { id: { in: [...refused] } },
               data: {
                  engageStoppedAt: now,
                  engageStopReason: 'LinkedIn refused an act. Engaging goes on in 24 hours.',
                  engageStopUntil: new Date(now.getTime() + ENGAGE_LIMITS.refusedStopHours * HOUR_MS),
               },
            })
         }
      })

      return changed
   }

   // The owner's acts on a person's posts, newest first, for the person's drawer.
   public static ofPerson(userId: string, slug: string) {
      return PrismaService.client.postAct.findMany({
         where: {
            userId,
            slug,
         },
         orderBy: { createdAt: 'desc' },
         take: 20,
         select: {
            id: true,
            act: true,
            reaction: true,
            state: true,
            reason: true,
            postUrl: true,
            plannedAt: true,
            doneAt: true,
            account: {
               select: {
                  email: true,
                  displayName: true,
               },
            },
         },
      })
   }
}

// Another pass took the acts first: they stay as it left them.
class ActsTaken extends Error {}

// The state an outcome of the file leaves an act in.
const changeOf = (outcome: EngageFile['acts'][number]['outcome'], now: Date): Prisma.PostActUpdateManyMutationInput => {
   switch (outcome) {
      case 'REACTED':
      case 'COMMENTED':
         return {
            state: 'DONE',
            doneAt: now,
            reason: null,
         }
      case 'ALREADY_REACTED':
         return {
            state: 'DONE',
            doneAt: now,
            reason: ENGAGE_REASONS.ALREADY_REACTED,
         }
      case 'POST_GONE':
         return {
            state: 'FAILED',
            reason: ENGAGE_REASONS.GONE,
         }
      case 'COMMENTS_OFF':
         return {
            state: 'FAILED',
            reason: ENGAGE_REASONS.COMMENTS_OFF,
         }
      case 'REFUSED':
         return {
            state: 'FAILED',
            reason: ENGAGE_REASONS.REFUSED,
         }
      case 'NOT_TRIED':
         return {
            state: 'QUEUED',
            sessionId: null,
            startedAt: null,
         }
      default:
         return {
            state: 'UNKNOWN',
            reason: 'LinkedIn did not show whether it went. It is not sent again.',
         }
   }
}
