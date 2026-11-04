import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type TaskResult } from '@automatedLinkedIn/contracts'

import { AccountLimitsService } from './accountLimits.service'
import { AccountRoomService } from './accountRoom.service'
import { linkedInEngageHooks } from './linkedInEngage.hooks'
import { LinkedInEngageService } from './linkedInEngage.service'
import { PeopleIndexService } from './peopleIndex.service'
import { PlatformSettingService } from './platformSetting.service'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { TaskUnavailableError } from './taskErrors'
import { UserService } from './user.service'

// Needs PostgreSQL. The spider is never asked: the task request is replaced by a stand-in that saves what brain asks for.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const DAY_MS = 24 * 60 * 60 * 1000
const post = (id: number) =>
   `https://www.linkedin.com/feed/update/urn:li:activity:75201957212168${String(id).padStart(5, '0')}/`

let userId: string
let accountId: string
let otherAccountId: string

const account = async () =>
   (
      await db.linkedInAccount.create({
         data: {
            userId,
            email: `${randomUUID()}@example.com`,
            secret: 'x',
            secretIv: 'x',
            secretTag: 'x',
            status: 'ACTIVE',
         },
      })
   ).id

// An invite of an account to a person, pending, so the account is the person's inviter.
const invited = (slug: string, from = accountId) =>
   db.linkedInInvite.create({
      data: {
         userId,
         accountId: from,
         slug,
         name: slug,
         state: 'SENT',
         plannedAt: new Date(),
         invitedAt: new Date(),
      },
   })

const candidate = (slug: string, id: number, extra: Record<string, unknown> = {}) => ({
   slug,
   postUrl: post(id),
   authorName: slug,
   authorHeadline: null,
   excerpt: 'A post about pipelines',
   postedAt: new Date(),
   ...extra,
})

const react = (candidates: ReturnType<typeof candidate>[], extra: Record<string, unknown> = {}) =>
   LinkedInEngageService.plan(userId, {
      accounts: { mode: 'inviter' },
      candidates,
      wish: {
         act: 'REACT',
         reactions: ['like', 'insightful'],
      },
      daysApart: 1,
      ...extra,
   })

const reasonOf = (plan: Awaited<ReturnType<typeof react>>, id: number) => plan.get(post(id))?.reason

const actsOf = (slug: string) =>
   db.postAct.findMany({
      where: {
         userId,
         slug,
      },
      orderBy: { createdAt: 'asc' },
   })

describe('LinkedInEngageService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      accountId = await account()
      otherAccountId = await account()

      for (const slug of ['ada', 'bob-no-invite', 'cy', 'dee', 'eve', 'fay', 'gus', 'hal', 'ivy', 'jo']) {
         await db.person.create({
            data: {
               userId,
               slug,
               lastTouchAt: new Date(),
            },
         })
      }

      for (const slug of ['ada', 'cy', 'dee', 'eve', 'fay', 'gus', 'hal', 'ivy', 'jo']) {
         await invited(slug)
      }

      await db.person.update({
         where: {
            userId_slug: {
               userId,
               slug: 'cy',
            },
         },
         data: { doNotContact: true },
      })
   })

   afterAll(async () => {
      vi.restoreAllMocks()
      await db.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should queue a reaction from the account that invited the author, and count it in the account\u2019s room', async () => {
      const before = (await AccountRoomService.forAccounts([accountId])).get(accountId)?.reactions.used ?? 0
      const plan = await react([candidate('ada', 1)])

      expect(plan.get(post(1))).toMatchObject({
         status: 'PLANNED',
         accountId,
      })
      expect(['like', 'insightful']).toContain(plan.get(post(1))?.reaction)
      expect(await actsOf('ada')).toMatchObject([
         {
            state: 'QUEUED',
            act: 'REACT',
            accountId,
            postKey: 'activity:7520195721216800001',
            postUrl: post(1),
         },
      ])
      expect((await AccountRoomService.forAccounts([accountId])).get(accountId)?.reactions.used).toBe(before + 1)
   })

   it('should say why a post is left: no invite, do not contact, too old, already reacted, not due, a bad link', async () => {
      const plan = await react([
         candidate('bob-no-invite', 2),
         candidate('cy', 3),
         candidate('dee', 4, { postedAt: new Date(Date.now() - 8 * DAY_MS) }),
         candidate('ada', 1),
         candidate('ada', 5),
         {
            ...candidate('eve', 6),
            postUrl: 'https://www.linkedin.com/in/eve/',
         },
      ])

      expect(reasonOf(plan, 2)).toBe('No invite from your accounts.')
      expect(reasonOf(plan, 3)).toBe('On Do not contact.')
      expect(reasonOf(plan, 4)).toBe('Post is older than a week.')
      expect(reasonOf(plan, 1)).toBe('Already reacted.')
      // Ada was reached a moment ago: her next post waits for the gap.
      expect(reasonOf(plan, 5)).toBe('Not due yet.')
      expect(plan.get('https://www.linkedin.com/in/eve/')?.reason).toBe('Not a post link that can be opened.')
      expect(await actsOf('cy')).toEqual([])
   })

   it('should plan one post of a person a call and leave the second for later', async () => {
      const plan = await react([candidate('dee', 7), candidate('dee', 8)])

      expect(plan.get(post(7))?.status).toBe('PLANNED')
      expect(reasonOf(plan, 8)).toBe('Not due yet.')
   })

   it('should plan nothing in a preview, and nothing while the admin paused acts', async () => {
      const preview = await react([candidate('eve', 9)], { dryRun: true })

      expect(preview.get(post(9))?.status).toBe('PLANNED')
      expect(await actsOf('eve')).toEqual([])

      await PlatformSettingService.setActs(false, 'admin')

      const paused = await react([candidate('eve', 9)])

      expect(reasonOf(paused, 9)).toBe('Paused by the admin.')
      expect(await actsOf('eve')).toEqual([])

      await PlatformSettingService.setActs(true, 'admin')
      expect(await PlatformSettingService.actsSwitch()).toMatchObject({
         on: true,
         changedBy: 'admin',
      })
   })

   it('should leave a post when the account has no room left today', async () => {
      const limit = (await AccountLimitsService.forAccount(accountId, ['reactionsPerDay']))?.reactionsPerDay ?? 0
      const used = (await AccountRoomService.forAccounts([accountId])).get(accountId)?.reactions.used ?? 0

      await db.postAct.createMany({
         data: Array.from({ length: limit - used }, (_u, index) => ({
            userId,
            accountId,
            slug: `filler-${index}`,
            postKey: `activity:filler${index}`,
            postUrl: post(900 + index),
            act: 'REACT' as const,
            state: 'DONE' as const,
            plannedAt: new Date(),
            startedAt: new Date(),
            doneAt: new Date(),
         })),
      })

      expect(reasonOf(await react([candidate('fay', 10)]), 10)).toBe('No room left today.')
      // The other account has room, and can be chosen.
      const chosen = await LinkedInEngageService.plan(userId, {
         accounts: {
            mode: 'chosen',
            ids: [accountId, otherAccountId],
         },
         candidates: [candidate('gus', 11)],
         wish: {
            act: 'REACT',
            reactions: ['love'],
         },
         daysApart: 1,
      })

      expect(chosen.get(post(11))).toMatchObject({
         status: 'PLANNED',
         accountId: otherAccountId,
         reaction: 'love',
      })
   })

   it('should start one run for the due acts, mark them sending, and wait while it is going', async () => {
      await db.postAct.deleteMany({ where: { slug: { startsWith: 'filler-' } } })
      // A third act, so the next test has one to refuse.
      expect((await react([candidate('ivy', 13)])).get(post(13))?.status).toBe('PLANNED')

      const sessionId = randomUUID()
      const request = vi.spyOn(TaskService, 'request').mockImplementation(async options => {
         await db.$transaction(tx => options.onStart?.(sessionId, tx) ?? Promise.resolve())

         return { id: sessionId } as Awaited<ReturnType<typeof TaskService.request>>
      })

      await expect(LinkedInEngageService.dispatchNext(accountId)).resolves.toEqual({ asked: true })
      expect(request.mock.calls[0]?.[0]).toMatchObject({
         task: 'linkedin-engage',
         accountId,
      })

      const input = request.mock.calls[0]?.[0].input as { acts: Array<{ id: string; kind: string; postUrl: string }> }

      expect(input.acts.length).toBeGreaterThan(0)
      expect(input.acts.every(({ kind }) => kind === 'react')).toBe(true)
      expect(
         await db.postAct.count({
            where: {
               sessionId,
               state: 'SENDING',
            },
         })
      ).toBe(input.acts.length)
      await expect(LinkedInEngageService.dispatchNext(accountId)).resolves.toMatchObject({
         asked: false,
         reason: 'A run of the account is going',
      })
      request.mockRestore()
   })

   it('should settle each act from the run\u2019s file, and stop the account for a day when LinkedIn refused', async () => {
      const acts = await db.postAct.findMany({
         where: {
            userId,
            state: 'SENDING',
         },
         orderBy: { createdAt: 'asc' },
      })
      const [first, second, third] = acts
      const sessionId = first?.sessionId ?? ''

      expect(acts.length).toBeGreaterThanOrEqual(3)

      await LinkedInEngageService.store(sessionId, {
         contract: 1,
         captured_at: new Date().toISOString(),
         acts: [
            {
               id: first?.id ?? '',
               outcome: 'REACTED',
            },
            {
               id: second?.id ?? '',
               outcome: 'POST_GONE',
            },
            {
               id: third?.id ?? '',
               outcome: 'REFUSED',
            },
         ],
      })

      expect(await db.postAct.findUnique({ where: { id: first?.id ?? '' } })).toMatchObject({ state: 'DONE' })
      expect(await db.postAct.findUnique({ where: { id: second?.id ?? '' } })).toMatchObject({
         state: 'FAILED',
         reason: 'The post is gone, or it is not the one asked for.',
      })
      expect(await db.postAct.findUnique({ where: { id: third?.id ?? '' } })).toMatchObject({ state: 'FAILED' })

      const stopped = await db.linkedInAccount.findUniqueOrThrow({ where: { id: accountId } })

      expect(stopped.engageStopUntil?.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000)
      // A stopped account plans nothing and starts nothing.
      expect(reasonOf(await react([candidate('hal', 12)]), 12)).toBe('Engaging of the account is stopped for now.')
      await expect(LinkedInEngageService.dispatchNext(accountId)).resolves.toMatchObject({
         asked: false,
         reason: 'Engaging of the account is stopped',
      })

      await db.linkedInAccount.update({
         where: { id: accountId },
         data: {
            engageStoppedAt: null,
            engageStopUntil: null,
         },
      })
   })

   it('should put an act the run did not try back in the queue, and leave one it could not confirm as unsure', async () => {
      const sessionId = randomUUID()
      const [one, two] = await db.postAct.createManyAndReturn({
         data: ['activity:untried', 'activity:unsure'].map((postKey, index) => ({
            userId,
            accountId,
            slug: 'ivy',
            postKey,
            postUrl: post(700 + index),
            act: 'REACT' as const,
            state: 'SENDING' as const,
            plannedAt: new Date(),
            startedAt: new Date(),
            sessionId,
         })),
      })

      await LinkedInEngageService.store(sessionId, {
         contract: 1,
         captured_at: new Date().toISOString(),
         acts: [
            {
               id: one?.id ?? '',
               outcome: 'NOT_TRIED',
            },
            {
               id: two?.id ?? '',
               outcome: 'UNKNOWN',
            },
         ],
      })

      expect(await db.postAct.findUnique({ where: { id: one?.id ?? '' } })).toMatchObject({
         state: 'QUEUED',
         sessionId: null,
      })
      expect(await db.postAct.findUnique({ where: { id: two?.id ?? '' } })).toMatchObject({ state: 'UNKNOWN' })
   })

   it('should cancel a queued act when the person accepted after it was planned, or went on Do not contact', async () => {
      const [acted] = await db.postAct.createManyAndReturn({
         data: [
            {
               userId,
               accountId,
               slug: 'jo',
               postKey: 'activity:accepted',
               postUrl: post(800),
               act: 'REACT' as const,
               plannedAt: new Date(Date.now() - 60_000),
            },
         ],
      })

      await db.linkedInInvite.updateMany({
         where: {
            userId,
            slug: 'jo',
         },
         data: {
            state: 'ACCEPTED',
            acceptedAt: new Date(),
         },
      })

      const request = vi.spyOn(TaskService, 'request').mockRejectedValue(new TaskUnavailableError())

      await LinkedInEngageService.dispatchNext(accountId)
      request.mockRestore()

      expect(await db.postAct.findUnique({ where: { id: acted?.id ?? '' } })).toMatchObject({
         state: 'CANCELLED',
         reason: 'They accepted.',
      })
   })

   it('should leave the acts waiting when the engage task is not available, and end runs that never answered', async () => {
      const [waiting] = await db.postAct.createManyAndReturn({
         data: [
            {
               userId,
               accountId: otherAccountId,
               slug: 'hal',
               postKey: 'activity:waiting',
               postUrl: post(810),
               act: 'REACT' as const,
               plannedAt: new Date(Date.now() - 60_000),
            },
         ],
      })
      const request = vi.spyOn(TaskService, 'request').mockRejectedValue(new TaskUnavailableError())

      await expect(LinkedInEngageService.dispatchNext(otherAccountId)).resolves.toEqual({
         asked: false,
         reason: 'The engage task is not available yet',
      })
      request.mockRestore()
      expect(await db.postAct.findUnique({ where: { id: waiting?.id ?? '' } })).toMatchObject({ state: 'QUEUED' })

      const [lost] = await db.postAct.createManyAndReturn({
         data: [
            {
               userId,
               accountId: otherAccountId,
               slug: 'hal',
               postKey: 'activity:lost',
               postUrl: post(811),
               act: 'REACT' as const,
               state: 'SENDING' as const,
               plannedAt: new Date(),
               startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            },
            {
               userId,
               accountId: otherAccountId,
               slug: 'hal',
               postKey: 'activity:old',
               postUrl: post(812),
               act: 'REACT' as const,
               plannedAt: new Date(Date.now() - 8 * DAY_MS),
            },
         ],
      })

      expect(await LinkedInEngageService.endStale()).toBe(1)
      expect(await LinkedInEngageService.expire()).toBe(1)
      expect(await db.postAct.findUnique({ where: { id: lost?.id ?? '' } })).toMatchObject({ state: 'UNKNOWN' })
   })

   it('should put the acts of a run that pressed nothing back in the queue, and leave the others unsure', async () => {
      const sessionId = randomUUID()
      const keys = ['activity:h1', 'activity:h2']
      const finish = (verdict: string) =>
         db.$transaction(async tx => {
            await linkedInEngageHooks.onResult?.(
               {
                  id: sessionId,
                  userId,
                  linkedInAccountId: otherAccountId,
               },
               { verdict } as TaskResult,
               tx
            )
         })
      const sending = () =>
         db.postAct.createMany({
            data: keys.map((postKey, index) => ({
               userId,
               accountId: otherAccountId,
               slug: 'hal',
               postKey,
               postUrl: post(820 + index),
               act: 'REACT' as const,
               state: 'SENDING' as const,
               plannedAt: new Date(),
               startedAt: new Date(),
               sessionId,
            })),
         })
      const inState = (state: 'QUEUED' | 'UNKNOWN') =>
         db.postAct.count({
            where: {
               postKey: { in: keys },
               state,
            },
         })

      await sending()
      await finish('ERROR')
      expect(await inState('QUEUED')).toBe(2)
      expect(await db.engageImport.count({ where: { sessionId } })).toBe(0)

      await db.postAct.updateMany({
         where: { postKey: { in: keys } },
         data: {
            state: 'SENDING',
            sessionId,
            startedAt: new Date(),
         },
      })
      await finish('CRASHED')
      expect(await inState('UNKNOWN')).toBe(2)
   })

   it('should copy the time of the last done act to the person, so My network can order by it', async () => {
      await db.linkedInInvite.updateMany({
         where: {
            userId,
            slug: 'ada',
         },
         data: { state: 'SENT' },
      })
      await db.postAct.updateMany({
         where: {
            userId,
            slug: 'ada',
         },
         data: {
            state: 'DONE',
            doneAt: new Date('2026-11-03T10:00:00.000Z'),
         },
      })
      await PeopleIndexService.refresh(userId, ['ada'])

      expect(
         (
            await db.person.findUniqueOrThrow({
               where: {
                  userId_slug: {
                     userId,
                     slug: 'ada',
                  },
               },
            })
         ).lastEngagedAt
      ).toEqual(new Date('2026-11-03T10:00:00.000Z'))
   })
})
