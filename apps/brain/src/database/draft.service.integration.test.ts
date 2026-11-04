import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DraftService } from './draft.service'
import { PeopleService } from './people.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { VoiceService } from './voice.service'

// Needs PostgreSQL. The inbox of drafts and the writing voices.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`
const HOUR_MS = 60 * 60 * 1000
const origin = {
   workflowId: 'w1',
   runId: 'r1',
   nodeId: 'ask',
}
const limits = {
   perDay: 3,
   keepWaiting: 20,
   expireHours: 48,
}

let userId: string
let otherUserId: string

const draft = (key: number, words = `Which step went first on number ${key}?`, slug = `ada-${key}`) => ({
   slug,
   targetKey: `activity:${key}`,
   item: {
      kind: 'post' as const,
      slug: `${key}`,
      url: `https://www.linkedin.com/feed/update/urn:li:activity:${key}`,
   },
   card: {
      postUrl: `https://www.linkedin.com/feed/update/urn:li:activity:${key}`,
      excerpt: 'A post',
      authorName: 'Ada',
      authorHeadline: null,
   },
   words,
   mode: 'AI' as const,
   maxChars: 220,
})

const queue = (drafts: ReturnType<typeof draft>[], extra: Partial<typeof limits> = {}, at = new Date()) =>
   DraftService.queue(
      userId,
      origin,
      {
         ...limits,
         ...extra,
      },
      'COMMENT',
      drafts,
      at
   )

beforeAll(async () => {
   userId = (await UserService.create({ email })).id
   otherUserId = (await UserService.create({ email: otherEmail })).id
})

afterAll(async () => {
   await db.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
   await PrismaService.disconnect()
})

describe('drafts (database)', () => {
   it('should queue up to the day limit, say the rest is over it, and not queue a post that already waits', async () => {
      const first = await queue([draft(1), draft(2), draft(3), draft(4)])

      expect([...first.values()]).toEqual(['QUEUED', 'QUEUED', 'QUEUED', 'OVER_DAY'])
      expect((await queue([draft(1)], { perDay: 10 })).get('activity:1')).toBe('WAITING')
      expect(
         (
            await queue([draft(5)], {
               perDay: 10,
               keepWaiting: 3,
            })
         ).get('activity:5')
      ).toBe('TOO_MANY')
   })

   it('should list what waits, count it, and show nothing of another owner', async () => {
      const { items } = await DraftService.list(userId, {
         state: 'DRAFTED',
         take: 10,
      })

      expect(items).toHaveLength(3)
      expect(items[0]?.card?.authorName).toBe('Ada')
      expect((await DraftService.counts(userId)).waiting).toBe(3)
      expect(
         (
            await DraftService.list(otherUserId, {
               state: 'DRAFTED',
               take: 10,
            })
         ).items
      ).toEqual([])
      expect((await DraftService.counts(otherUserId)).waiting).toBe(0)
   })

   it('should approve as it is, give the act a day, and not start anything itself', async () => {
      const [first] = (
         await DraftService.list(userId, {
            state: 'DRAFTED',
            take: 10,
         })
      ).items
      const done = await DraftService.approve(userId, [{ id: first?.id ?? '' }])

      expect(done.approved).toEqual([first?.id])

      const row = await db.draft.findUniqueOrThrow({ where: { id: first?.id } })

      expect(row.state).toBe('APPROVED')
      expect(row.startedRunId).toBeNull()
      expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * HOUR_MS)
      expect(row.expiresAt.getTime() - Date.now()).toBeLessThan(25 * HOUR_MS)
      expect((await DraftService.approve(userId, [{ id: first?.id ?? '' }])).refused).toHaveLength(1)
   })

   it('should refuse an edit that fails a check and keep the original words, and take a good edit', async () => {
      const [second] = (
         await DraftService.list(userId, {
            state: 'DRAFTED',
            take: 10,
         })
      ).items
      const bad = await DraftService.approve(userId, [
         {
            id: second?.id ?? '',
            words: 'Read https://example.com now',
         },
      ])

      expect(bad.approved).toEqual([])
      expect(bad.refused[0]?.reason).toBe('No link')

      const good = await DraftService.approve(userId, [
         {
            id: second?.id ?? '',
            words: 'A better question for you?',
         },
      ])
      const row = await db.draft.findUniqueOrThrow({ where: { id: second?.id } })

      expect(good.approved).toEqual([second?.id])
      expect(row.words).toBe('A better question for you?')
      expect(row.originalWords).toBe(second?.words)
      expect((await DraftService.counts(userId)).edited).toBe(1)
   })

   it('should reject only the owner\u2019s own waiting drafts, with a reason', async () => {
      const [third] = (
         await DraftService.list(userId, {
            state: 'DRAFTED',
            take: 10,
         })
      ).items

      expect(await DraftService.reject(otherUserId, [third?.id ?? ''], 'OTHER')).toBe(0)
      expect(await DraftService.reject(userId, [third?.id ?? ''], 'TOO_GENERIC')).toBe(1)
      expect((await db.draft.findUniqueOrThrow({ where: { id: third?.id } })).rejectReason).toBe('TOO_GENERIC')
   })

   it('should offer the approved drafts to start once, and give their items with the final words', async () => {
      const waiting = await DraftService.approvedToStart()

      expect(waiting).toHaveLength(2)

      await DraftService.markStarted(
         waiting.map(({ id }) => id),
         'run-1'
      )

      expect(await DraftService.approvedToStart()).toEqual([])

      const items = await DraftService.itemsOf(
         userId,
         waiting.map(({ id }) => id)
      )

      expect(items.map(({ words }) => words).sort()).toEqual(['A better question for you?', expect.any(String)].sort())
      expect(
         await DraftService.itemsOf(
            otherUserId,
            waiting.map(({ id }) => id)
         )
      ).toEqual([])
   })

   it('should expire what no one decided, cancel a comment for someone who accepted, and clear old text', async () => {
      await queue([draft(10), draft(11, 'A different thought about hiring.', 'grace'), draft(12)], { perDay: 10 })
      await db.draft.updateMany({
         where: { targetKey: 'activity:10' },
         data: { expiresAt: new Date(Date.now() - HOUR_MS) },
      })
      await db.linkedInAccount
         .create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: 'x',
               secretIv: 'x',
               secretTag: 'x',
               status: 'ACTIVE',
            },
         })
         .then(({ id }) =>
            db.linkedInInvite.create({
               data: {
                  userId,
                  accountId: id,
                  slug: 'grace',
                  name: 'Grace',
                  state: 'ACCEPTED',
                  plannedAt: new Date(),
                  invitedAt: new Date(),
                  acceptedAt: new Date(Date.now() + 1000),
               },
            })
         )
      await db.draft.updateMany({
         where: { targetKey: 'activity:12' },
         data: { draftedAt: new Date(Date.now() - 40 * 24 * HOUR_MS) },
      })

      const swept = await DraftService.sweep()
      const states = Object.fromEntries(
         (await db.draft.findMany({ where: { targetKey: { in: ['activity:10', 'activity:11', 'activity:12'] } } })).map(
            row => [row.targetKey, [row.state, row.words]]
         )
      )

      expect(swept).toMatchObject({
         expired: expect.any(Number),
         cancelled: 1,
         cleared: 1,
      })
      expect(states['activity:10']?.[0]).toBe('EXPIRED')
      expect(states['activity:11']?.[0]).toBe('CANCELLED')
      expect(states['activity:12']).toEqual([expect.any(String), null])
   })

   it('should erase the drafts of a person with the person', async () => {
      await queue([draft(20, 'Hello there, nice post?', 'erase-me')], { perDay: 50 })
      await db.person.create({
         data: {
            userId,
            slug: 'erase-me',
            name: 'Erase Me',
            labels: [],
            lastTouchAt: new Date(),
         },
      })

      const person = await db.person.findFirstOrThrow({
         where: {
            userId,
            slug: 'erase-me',
         },
      })

      await PeopleService.erase(userId, person.id)

      expect(
         await db.draft.count({
            where: {
               userId,
               slug: 'erase-me',
            },
         })
      ).toBe(0)
   })
})

describe('writing voices (database)', () => {
   it('should keep a voice per owner by name, change only the owner\u2019s own, and refuse a name twice', async () => {
      const voice = await VoiceService.save(userId, {
         name: 'Agency voice',
         avoid: ['Guarantee'],
      })

      expect(voice).toMatchObject({
         name: 'Agency voice',
         tone: 'friendly',
         avoid: ['guarantee'],
      })
      await expect(VoiceService.save(userId, { name: 'Agency voice' })).rejects.toThrow('already have a voice')
      expect(await VoiceService.save(otherUserId, { name: 'Taken' }, voice?.id)).toBeNull()
      expect(
         (
            await VoiceService.save(
               userId,
               {
                  name: 'Agency voice',
                  tone: 'direct',
               },
               voice?.id
            )
         )?.tone
      ).toBe('direct')
      expect((await VoiceService.list(otherUserId)).map(({ name }) => name)).toEqual([])
      expect(await VoiceService.remove(otherUserId, voice?.id ?? '')).toBe(false)
      expect(await VoiceService.remove(userId, voice?.id ?? '')).toBe(true)
   })
})
