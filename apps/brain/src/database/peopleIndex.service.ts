import { profileFacts, readSignals, readSnapshot } from 'core'

import { type Prisma } from 'generated/prisma/client'

import { type DraftPerson, type Sources, draftPerson } from './peopleIndex'
import { profileUrlOf } from './personContacts'
import { PrismaService } from './prisma.service'

// How many marked profiles one pass rebuilds.
const BATCH = 200

const PROFILE_SLUG = /\/in\/([^/?#]+)/
const MEMBER_ID = /^ACo/

const slugOfConversation = (url: string | null, begunWith: string | null | undefined, byName: string | undefined) => {
   const [, slug] = PROFILE_SLUG.exec(url ?? '') ?? []

   return slug && !MEMBER_ID.test(slug) ? slug : (begunWith ?? byName)
}

// The owner's chats LinkedIn names by member id that the name rule (`people_index_slug_by_name`) ties to one of these profiles.
const chatsByName = async (userId: string, slugs: string[]) =>
   new Map(
      (
         await PrismaService.client.$queryRaw<Array<{ id: string; slug: string }>>`
            SELECT c."id", s."slug" FROM "LinkedInConversation" c
            CROSS JOIN LATERAL (SELECT people_index_conversation_slug(c."id", c."contactProfileUrl") AS "slug") s
            WHERE c."userId" = ${userId} AND c."kind" = 'DIRECT' AND c."contactProfileUrl" LIKE '%/in/ACo%'
              AND c."participants" -> 0 ->> 'name' IN (
                 SELECT "name" FROM "LinkedInConnection" WHERE "userId" = ${userId} AND "slug" = ANY(${slugs})
                 UNION SELECT "name" FROM "LinkedInInvite" WHERE "userId" = ${userId} AND "slug" = ANY(${slugs})
                 UNION SELECT "name" FROM "LinkedInInvitation" WHERE "userId" = ${userId} AND "slug" = ANY(${slugs})
                 UNION SELECT "name" FROM "Person" WHERE "userId" = ${userId} AND "slug" = ANY(${slugs})
              )
              AND s."slug" = ANY(${slugs})`
      ).map(({ id, slug }) => [id, slug])
   )

type Participant = { name?: string; imageUrl?: string }

const firstParticipant = (participants: Prisma.JsonValue): Participant => {
   const [first] = Array.isArray(participants) ? participants : []

   return first && typeof first === 'object' && !Array.isArray(first) ? (first as Participant) : {}
}

const bySlug = <T>(rows: T[], slugOf: (row: T) => string | undefined) => {
   const grouped = new Map<string, T[]>()

   for (const row of rows) {
      const slug = slugOf(row)

      if (slug) {
         grouped.set(slug, [...(grouped.get(slug) ?? []), row])
      }
   }

   return grouped
}

// My network's index (.plan/network-hub.md): database triggers mark a profile whenever a row that ties it to the owner changes,
// and this rebuilds the marked profiles' people, one per profile.
export class PeopleIndexService {
   // Rebuilds up to one batch of marked profiles; resolves to how many. A mark made while it ran stays for the next pass.
   public static async drain(limit = BATCH) {
      const db = PrismaService.client
      const marked = await db.peopleIndexDirty.findMany({
         orderBy: { createdAt: 'asc' },
         take: limit,
      })
      const owners = bySlug(marked, ({ userId }) => userId)
      // Deleting an owner fires the triggers on their rows, so their marks outlive them; those are only cleared.
      const live = new Set(
         (
            await db.user.findMany({
               where: { id: { in: [...owners.keys()] } },
               select: { id: true },
            })
         ).map(({ id }) => id)
      )

      for (const [userId, marks] of owners) {
         if (!live.has(userId)) {
            continue
         }

         try {
            await PeopleIndexService.refresh(
               userId,
               marks.map(({ slug }) => slug)
            )
         } catch (error) {
            // An owner deleted while this ran is gone like one deleted before; anything else is a real failure.
            if ((await db.user.count({ where: { id: userId } })) > 0) {
               throw error
            }
         }
      }

      for (const { userId, slug, createdAt } of marked) {
         await db.peopleIndexDirty.deleteMany({
            where: {
               userId,
               slug,
               createdAt,
            },
         })
      }

      return marked.length
   }

   // Rebuilds the people of these profiles of one owner from their rows.
   public static async refresh(userId: string, slugs: string[]) {
      const db = PrismaService.client
      const accounts = await db.linkedInAccount.findMany({
         where: { userId },
         select: { id: true },
      })
      const accountIds = accounts.map(({ id }) => id)
      const urls = slugs.flatMap(slug => [profileUrlOf(slug), profileUrlOf(slug).slice(0, -1)])
      const named = await chatsByName(userId, slugs)
      const [
         requests,
         connections,
         conversations,
         members,
         targets,
         suppressed,
         existing,
         invites,
         snapshots,
         engaged,
      ] = await Promise.all([
         db.linkedInInvitation.findMany({
            where: {
               userId,
               accountId: { in: accountIds },
               slug: { in: slugs },
            },
         }),
         db.linkedInConnection.findMany({
            where: {
               userId,
               accountId: { in: accountIds },
               slug: { in: slugs },
            },
         }),
         db.linkedInConversation.findMany({
            where: {
               userId,
               kind: 'DIRECT',
               OR: [
                  { contactProfileUrl: { in: urls } },
                  { replies: { some: { recipientSlug: { in: slugs } } } },
                  { id: { in: [...named.keys()] } },
               ],
            },
            select: {
               id: true,
               accountId: true,
               contactProfileUrl: true,
               participants: true,
               lastMessageAt: true,
               lastDirection: true,
               lastReplyAt: true,
               waitingSince: true,
               doneAt: true,
               createdAt: true,
               replies: {
                  where: { recipientSlug: { not: null } },
                  select: { recipientSlug: true },
                  take: 1,
               },
            },
         }),
         db.workflowListMember.findMany({
            where: {
               list: { userId },
               slug: { in: slugs },
            },
         }),
         db.linkedInProfile.findMany({
            where: {
               userId,
               slug: { in: slugs },
               archivedAt: null,
            },
         }),
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
            },
            select: {
               id: true,
               slug: true,
               doNotContact: true,
               notes: true,
               labels: true,
               statusSetAt: true,
            },
         }),
         db.linkedInInvite.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: {
               id: true,
               accountId: true,
               slug: true,
               name: true,
               state: true,
               invitedAt: true,
               acceptedAt: true,
               createdAt: true,
            },
         }),
         db.personSnapshot.findMany({
            where: {
               userId,
               slug: { in: slugs },
            },
            select: {
               slug: true,
               data: true,
            },
         }),
         db.postAct.groupBy({
            by: ['slug'],
            where: {
               userId,
               slug: { in: slugs },
               state: 'DONE',
            },
            _max: { doneAt: true },
         }),
      ])
      const facts = new Map(
         snapshots.flatMap(({ slug, data }) => {
            const snapshot = readSnapshot(data)

            return snapshot ? [[slug, profileFacts(snapshot)] as const] : []
         })
      )
      // Their newest message in each conversation: its words when it is also the last one, and when it came.
      const theirNewest = new Map(
         (conversations.length > 0
            ? await db.linkedInMessage.findMany({
                 where: {
                    conversationId: { in: conversations.map(({ id }) => id) },
                    direction: 'THEM',
                 },
                 orderBy: { position: 'desc' },
                 distinct: ['conversationId'],
                 select: {
                    conversationId: true,
                    text: true,
                    sentAt: true,
                 },
              })
            : []
         ).map(({ conversationId, ...message }) => [conversationId, message])
      )
      const rows = {
         requests: bySlug(requests, ({ slug }) => slug),
         connections: bySlug(connections, ({ slug }) => slug),
         conversations: bySlug(conversations, row =>
            slugOfConversation(row.contactProfileUrl, row.replies[0]?.recipientSlug, named.get(row.id))
         ),
         members: bySlug(members, ({ slug }) => slug),
         targets: bySlug(targets, ({ slug }) => slug),
         invites: bySlug(invites, ({ slug }) => slug),
      }
      const blocked = new Set(suppressed.map(({ slug }) => slug))
      const engagedBy = new Map(engaged.map(({ slug, _max }) => [slug, _max.doneAt]))

      for (const slug of new Set(slugs)) {
         const sources: Sources = {
            requests: (rows.requests.get(slug) ?? []).map(row => ({
               id: row.id,
               accountId: row.accountId,
               name: row.name,
               headline: row.headline,
               photoUrl: row.photoUrl,
               note: row.note,
               status: row.status,
               seenAt: row.seenAt,
               createdAt: row.createdAt,
            })),
            connections: (rows.connections.get(slug) ?? []).map(row => ({
               id: row.id,
               accountId: row.accountId,
               name: row.name,
               headline: row.headline,
               photoUrl: row.photoUrl,
               status: row.status,
               connectedOn: row.connectedOn,
               seenAt: row.seenAt,
               createdAt: row.createdAt,
            })),
            conversations: (rows.conversations.get(slug) ?? []).map(row => {
               const person = firstParticipant(row.participants)
               const newest = theirNewest.get(row.id)
               const theirsLast = row.lastDirection === 'THEM'

               return {
                  id: row.id,
                  accountId: row.accountId,
                  name: person.name ?? null,
                  photoUrl: person.imageUrl ?? null,
                  lastMessageAt: row.lastMessageAt,
                  lastDirection: row.lastDirection,
                  lastReplyAt: row.lastReplyAt,
                  waitingSince: row.waitingSince,
                  doneAt: row.doneAt,
                  lastText: theirsLast && newest ? newest.text.slice(0, 200) : null,
                  theirLastAt: newest?.sentAt ?? (theirsLast ? row.lastMessageAt : null),
                  createdAt: row.createdAt,
               }
            }),
            members: (rows.members.get(slug) ?? []).map(row => {
               const [signal] = readSignals(row.signals)

               return {
                  id: row.id,
                  listId: row.listId,
                  name: row.name,
                  headline: row.headline,
                  company: row.company,
                  state: row.state,
                  status: row.status,
                  score: row.score,
                  postUrl: row.postUrl,
                  url: row.url,
                  signal: signal
                     ? {
                          type: signal.type,
                          via: signal.via,
                          excerpt: signal.excerpt,
                          at: signal.at,
                       }
                     : null,
                  createdAt: row.createdAt,
               }
            }),
            targets: (rows.targets.get(slug) ?? []).map(row => ({
               id: row.id,
               name: row.fullName,
               headline: row.headline,
               company: row.company,
               status: row.status,
               url: row.url,
               createdAt: row.createdAt,
            })),
            invites: (rows.invites.get(slug) ?? []).map(({ slug: inviteSlug, ...row }) => ({
               ...row,
               // An invite asked before any name was known carries the address; it is no name.
               name: row.name === inviteSlug ? null : row.name,
            })),
            facts: facts.get(slug) ?? null,
            engagedAt: engagedBy.get(slug) ?? null,
         }
         await PeopleIndexService.write(
            userId,
            slug,
            draftPerson(sources, profileUrlOf(slug)),
            existing.find(person => person.slug === slug),
            blocked.has(slug)
         )
      }
   }

   private static async write(
      userId: string,
      slug: string,
      draft: DraftPerson | null,
      existing:
         | {
              id: string
              doNotContact: boolean
              notes: string | null
              labels: string[]
              statusSetAt: Date | null
           }
         | undefined,
      blocked: boolean
   ) {
      await PrismaService.client.$transaction(async tx => {
         if (draft) {
            const { links, status, firstSeenAt, ...fields } = draft
            const person = await tx.person.upsert({
               where: {
                  userId_slug: {
                     userId,
                     slug,
                  },
               },
               create: {
                  userId,
                  slug,
                  status,
                  firstSeenAt,
                  doNotContact: blocked,
                  ...fields,
               },
               update: {
                  ...fields,
                  ...(existing?.statusSetAt ? {} : { status }),
                  ...(blocked ? { doNotContact: true } : {}),
               },
               select: { id: true },
            })

            if (fields.name) {
               await tx.linkedInInvite.updateMany({
                  where: {
                     userId,
                     slug,
                     name: slug,
                  },
                  data: { name: fields.name },
               })
            }

            await tx.personLink.deleteMany({
               where: {
                  personId: person.id,
                  NOT: {
                     OR: links.map(({ kind, sourceId }) => ({
                        kind,
                        sourceId,
                     })),
                  },
               },
            })
            await tx.personLink.createMany({
               data: links.map(link => ({
                  personId: person.id,
                  ...link,
               })),
               skipDuplicates: true,
            })

            return
         }

         // A person with no rows left goes, unless the owner kept something of their own on them.
         if (existing) {
            if (existing.doNotContact || blocked || existing.notes || existing.labels.length > 0) {
               await tx.personLink.deleteMany({ where: { personId: existing.id } })
               await tx.person.update({
                  where: { id: existing.id },
                  data: {
                     priority: 0,
                     waiting: false,
                     foundBy: [],
                     ...(blocked ? { doNotContact: true } : {}),
                  },
               })
            } else {
               await tx.person.delete({ where: { id: existing.id } })
            }
         }
      })
   }
}
