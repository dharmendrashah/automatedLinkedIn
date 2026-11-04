import { type ChatPointer, digestText } from 'core'

import { type PersonFactValue } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'

// What is stored about people, read for "If person state" and "Get our chat with them" (.plan/lead-pipeline-p2-checks.md). Every query
// takes a batch of slugs at once: a run of 50,000 people never asks one question per person.

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const BATCH = 500
const MAX_CONVERSATIONS = 5

type Facts = Record<string, PersonFactValue>

const batches = <T>(items: T[]) =>
   Array.from({ length: Math.ceil(items.length / BATCH) }, (_unused, index) =>
      items.slice(index * BATCH, (index + 1) * BATCH)
   )

const daysSince = (date: Date | null | undefined, now: Date) =>
   date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS)) : null

export type AccountRead = {
   accountId: string
   name: string
   connectionsReadAt: Date | null
   messagesReadAt: Date | null
}

export class PersonStateService {
   // When each account's connections and messages were last read, for the freshness line of the block and for what counts as known.
   // Without ids, every account of the owner.
   public static async reads(userId: string, accountIds?: string[]): Promise<AccountRead[]> {
      const rows = await PrismaService.client.linkedInAccount.findMany({
         where: {
            userId,
            ...(accountIds && { id: { in: accountIds } }),
         },
         orderBy: { createdAt: 'asc' },
         select: {
            id: true,
            email: true,
            displayName: true,
            connectionsReadAt: true,
            messagesReadAt: true,
         },
      })

      return rows.map(row => ({
         accountId: row.id,
         name: row.displayName ?? row.email,
         connectionsReadAt: row.connectionsReadAt,
         messagesReadAt: row.messagesReadAt,
      }))
   }

   // The facts of each person, by slug. A fact that cannot be known (no fresh read, nothing stored) is null.
   public static async facts(
      userId: string,
      slugs: string[],
      scope: { accountIds: string[]; maxAgeHours: number },
      now = new Date()
   ): Promise<Map<string, Facts>> {
      const reads = await this.reads(userId, scope.accountIds)
      const fresh = (at: Date | null) => at !== null && now.getTime() - at.getTime() <= scope.maxAgeHours * HOUR_MS
      const connectionAccounts = reads
         .filter(({ connectionsReadAt }) => fresh(connectionsReadAt))
         .map(({ accountId }) => accountId)
      const messageAccounts = reads
         .filter(({ messagesReadAt }) => fresh(messagesReadAt))
         .map(({ accountId }) => accountId)
      const found = await Promise.all(
         batches(slugs).map(batch =>
            this.factsOf(userId, batch, connectionAccounts, messageAccounts, scope.accountIds, now)
         )
      )

      return new Map(found.flatMap(map => [...map]))
   }

   private static async factsOf(
      userId: string,
      slugs: string[],
      connectionAccounts: string[],
      messageAccounts: string[],
      accountIds: string[],
      now: Date
   ) {
      const db = PrismaService.client
      const [people, suppressed, profiles, connections, accepts, links] = await Promise.all([
         db.person.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: {
               slug: true,
               doNotContact: true,
               status: true,
               labels: true,
               score: true,
               profileRead: true,
               waiting: true,
               lastSentAt: true,
               lastReceivedAt: true,
               inviteState: true,
               invitedAt: true,
            },
         }),
         db.suppression.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: { slug: true },
         }),
         db.linkedInProfile.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: {
               slug: true,
               email: true,
            },
         }),
         connectionAccounts.length === 0
            ? []
            : db.linkedInConnection.findMany({
                 where: {
                    userId,
                    slug: { in: slugs },
                    accountId: { in: connectionAccounts },
                    status: { in: ['CONNECTED', 'REMOVING'] },
                 },
                 select: {
                    slug: true,
                    accountId: true,
                    connectedOn: true,
                 },
              }),
         db.linkedInInvite.groupBy({
            by: ['slug'],
            where: {
               userId,
               slug: { in: slugs },
               accountId: { in: accountIds },
               acceptedAt: { not: null },
            },
            _min: { acceptedAt: true },
         }),
         messageAccounts.length === 0
            ? []
            : db.personLink.findMany({
                 where: {
                    kind: 'CONVERSATION',
                    accountId: { in: messageAccounts },
                    person: {
                       userId,
                       slug: { in: slugs },
                    },
                 },
                 select: {
                    sourceId: true,
                    person: { select: { slug: true } },
                 },
              }),
      ])
      const directs = await this.directIds(
         userId,
         links.map(({ sourceId }) => sourceId)
      )
      const direct = links.filter(({ sourceId }) => directs.has(sourceId))
      const directions = await this.directionsOf(direct.map(({ sourceId }) => sourceId))
      const personBy = new Map(people.map(person => [person.slug, person]))
      const blocked = new Set(suppressed.map(({ slug }) => slug))
      const emailBy = new Map(profiles.map(({ slug, email }) => [slug, email]))
      const acceptedBy = new Map(accepts.map(({ slug, _min }) => [slug, _min.acceptedAt]))

      return new Map(
         slugs.map((slug): [string, Facts] => {
            const person = personBy.get(slug)
            const mine = connections.filter(row => row.slug === slug)
            const chats = direct.filter(link => link.person.slug === slug).map(({ sourceId }) => sourceId)
            const wrote = chats.some(id => directions.get(id)?.has('ME'))
            const theyWrote = chats.some(id => directions.get(id)?.has('THEM'))
            const readMessages = messageAccounts.length > 0
            const readConnections = connectionAccounts.length > 0
            const [since] = [acceptedBy.get(slug), ...mine.map(({ connectedOn }) => connectedOn)]
               .filter((date): date is Date => date instanceof Date)
               .sort((a, b) => a.getTime() - b.getTime())

            return [
               slug,
               {
                  connected: readConnections ? mine.length > 0 : null,
                  connectedCount: readConnections ? new Set(mine.map(({ accountId }) => accountId)).size : null,
                  connectedDays: readConnections && mine.length > 0 ? daysSince(since, now) : null,
                  inviteState: person ? person.inviteState.toLowerCase() : 'none',
                  invitePendingDays: person?.inviteState === 'PENDING' ? daysSince(person.invitedAt, now) : null,
                  chatStored: readMessages ? chats.length > 0 : null,
                  wroteTo: readMessages ? wrote : null,
                  theyWrote: readMessages ? theyWrote : null,
                  waiting: person?.waiting ?? false,
                  daysSinceWrote: daysSince(person?.lastSentAt, now),
                  daysSinceTheyWrote: daysSince(person?.lastReceivedAt, now),
                  doNotContact: (person?.doNotContact ?? false) || blocked.has(slug),
                  status: person ? person.status.toLowerCase() : 'new',
                  label: person?.labels ?? [],
                  score: person?.score ?? null,
                  profileRead: person?.profileRead ?? false,
                  hasEmail: Boolean(emailBy.get(slug)),
               },
            ]
         })
      )
   }

   // The one-to-one conversations among these; a group chat is not a chat with a person.
   private static async directIds(userId: string, conversationIds: string[]) {
      const out = new Set<string>()

      for (const batch of batches([...new Set(conversationIds)])) {
         const rows = await PrismaService.client.linkedInConversation.findMany({
            where: {
               userId,
               kind: 'DIRECT',
               id: { in: batch },
            },
            select: { id: true },
         })

         rows.forEach(({ id }) => out.add(id))
      }

      return out
   }

   // Which sides of each conversation have written.
   private static async directionsOf(conversationIds: string[]) {
      const out = new Map<string, Set<string>>()

      for (const batch of batches([...new Set(conversationIds)])) {
         const rows = await PrismaService.client.linkedInMessage.groupBy({
            by: ['conversationId', 'direction'],
            where: { conversationId: { in: batch } },
         })

         for (const { conversationId, direction } of rows) {
            out.set(conversationId, (out.get(conversationId) ?? new Set()).add(direction))
         }
      }

      return out
   }

   // Where the stored chat with each person is: direct conversations only, with pointers and counts and no words.
   public static async chats(
      userId: string,
      slugs: string[],
      scope: { accountIds: string[]; maxAgeDays: number | null },
      now = new Date()
   ): Promise<Map<string, ChatPointer>> {
      const reads = await this.reads(userId, scope.accountIds)
      const read = reads.some(({ messagesReadAt }) => messagesReadAt !== null)
      const newest = scope.maxAgeDays === null ? null : new Date(now.getTime() - scope.maxAgeDays * DAY_MS)
      const out = new Map<string, ChatPointer>()

      for (const batch of batches(slugs)) {
         const links = await PrismaService.client.personLink.findMany({
            where: {
               kind: 'CONVERSATION',
               accountId: { in: scope.accountIds },
               person: {
                  userId,
                  slug: { in: batch },
               },
            },
            select: {
               sourceId: true,
               person: { select: { slug: true } },
            },
         })
         const conversations = await PrismaService.client.linkedInConversation.findMany({
            where: {
               userId,
               id: { in: links.map(({ sourceId }) => sourceId) },
               kind: 'DIRECT',
               ...(newest && { lastMessageAt: { gte: newest } }),
            },
            orderBy: { lastMessageAt: 'desc' },
            select: {
               id: true,
               accountId: true,
               complete: true,
               messageCount: true,
               lastDirection: true,
            },
         })
         const directions = await this.directionsOf(conversations.map(({ id }) => id))
         const slugOf = new Map(links.map(({ sourceId, person }) => [sourceId, person.slug]))

         for (const slug of batch) {
            const mine = conversations.filter(({ id }) => slugOf.get(id) === slug)

            out.set(slug, {
               stored: read ? mine.length > 0 : null,
               complete: mine.length > 0 && mine.every(({ complete }) => complete),
               accountIds: [...new Set(mine.map(({ accountId }) => accountId))],
               conversationIds: mine.slice(0, MAX_CONVERSATIONS).map(({ id }) => id),
               messages: mine.reduce((sum, { messageCount }) => sum + messageCount, 0),
               weWrote: mine.some(({ id }) => directions.get(id)?.has('ME')),
               theyWrote: mine.some(({ id }) => directions.get(id)?.has('THEM')),
               lastFrom: mine[0]?.lastDirection ?? null,
            })
         }
      }

      return out
   }

   // The newest messages of the owner's stored chats with one person, cut and cleaned, for the owner to read. Read at the moment it is
   // asked for, owner-scoped; nothing is kept.
   public static async digest(
      userId: string,
      slug: string,
      options: { accountIds: string[]; latest: number; redact: boolean }
   ) {
      const links = await PrismaService.client.personLink.findMany({
         where: {
            kind: 'CONVERSATION',
            accountId: { in: options.accountIds },
            person: {
               userId,
               slug,
            },
         },
         select: { sourceId: true },
      })
      const messages = await PrismaService.client.linkedInMessage.findMany({
         where: {
            conversation: {
               userId,
               kind: 'DIRECT',
               id: { in: links.map(({ sourceId }) => sourceId) },
            },
         },
         orderBy: [{ sentAt: 'desc' }, { position: 'desc' }],
         take: options.latest,
         select: {
            direction: true,
            whenText: true,
            text: true,
         },
      })

      return messages.reverse().map(({ direction, whenText, text }) => ({
         from: direction,
         when: whenText,
         text: digestText(text, options.redact),
      }))
   }
}
