import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { limitOf } from './limits'
import { LinkedInInviteService } from './linkedInInvite.service'
import { PeopleService } from './people.service'
import { PeopleIndexService } from './peopleIndex.service'
import { PrismaService } from './prisma.service'
import { TaskService } from './task.service'
import { UserService } from './user.service'
import { WorkflowListService } from './workflowList.service'

// Needs PostgreSQL, with the migration add_network_invites.

const db = PrismaService.client
const SLUGS = ['ada-l', 'grace-h', 'alan-t', 'mary-s']

let userId: string
let otherUserId: string
let accountId: string

const personId = async (slug: string) =>
   (
      await db.person.findFirstOrThrow({
         where: {
            userId,
            slug,
         },
         select: { id: true },
      })
   ).id

const invitesOf = (slug: string) =>
   db.linkedInInvite.findMany({
      where: {
         userId,
         slug,
      },
      orderBy: { createdAt: 'asc' },
   })

describe('LinkedInInviteService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      otherUserId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      accountId = (
         await db.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: 'x',
               secretIv: 'x',
               secretTag: 'x',
               status: 'ACTIVE',
               lastVerifiedAt: new Date(),
            },
         })
      ).id

      const list = await WorkflowListService.createList(userId, 'Post commenters')

      for (const slug of SLUGS) {
         await WorkflowListService.addMember(userId, list.id, {
            slug,
            url: `https://www.linkedin.com/in/${slug}/`,
            name: `${slug} Person`,
            headline: 'Head of Sales',
            location: null,
            state: 'QUALIFIED',
         })
      }

      // Mary sent the account a request: she is skipped.
      await db.linkedInInvitation.create({
         data: {
            userId,
            accountId,
            linkedInId: randomUUID(),
            slug: 'mary-s',
            name: 'Mary S',
            headline: 'Head of Sales',
         },
      })
      await PeopleIndexService.refresh(userId, SLUGS)
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
   })

   it('should list people found by a list with a fit as ready to invite', async () => {
      expect(
         await db.person.findFirst({
            where: {
               userId,
               slug: 'ada-l',
            },
         })
      ).toMatchObject({ priority: 1 })
      expect(
         await db.person.findFirst({
            where: {
               userId,
               slug: 'mary-s',
            },
         })
      ).toMatchObject({ priority: 2 })
   })

   it('should plan without queuing, skip a person with a request, and refuse an owner with no account', async () => {
      const ids = await Promise.all(SLUGS.map(personId))
      const plan = await LinkedInInviteService.plan(userId, { personIds: ids })
      const limit = limitOf('invitesPerDay', accountId, new Date(), 'UTC')

      expect(plan).toMatchObject({
         accountId,
         today: limit,
         toInvite: 3,
         unnamed: 0,
         skipped: { REQUEST: 1 },
      })
      expect(plan.sentence).toBe(
         `You can safely send ${limit} today. 4 selected: all today. Skipped: 1 with a request pending.`
      )
      expect(await db.linkedInInvite.count({ where: { userId } })).toBe(0)
      await expect(LinkedInInviteService.plan(otherUserId, { personIds: ids })).rejects.toThrow(
         'Inviting needs a signed-in account'
      )
   })

   it('should queue invites with the note as written, and skip people invited already on a second ask', async () => {
      const ids = await Promise.all(SLUGS.slice(0, 3).map(personId))

      await expect(
         LinkedInInviteService.invite(userId, {
            personIds: ids,
            note: 'Hi {first_name}',
         })
      ).resolves.toMatchObject({ queued: 3 })
      expect((await invitesOf('ada-l'))[0]).toMatchObject({
         state: 'QUEUED',
         note: 'Hi {first_name}',
         accountId,
      })
      expect((await LinkedInInviteService.invite(userId, { personIds: ids })).queued).toBe(0)
      expect((await invitesOf('ada-l'))[1]).toMatchObject({ state: 'SKIPPED' })
   })

   it('should send the due invites in one run, settle them from its file, and show them as contacted and waiting', async () => {
      const sessionId = randomUUID()
      const request = vi.spyOn(TaskService, 'request').mockImplementation(async options => {
         await db.$transaction(tx => options.onStart?.(sessionId, tx) ?? Promise.resolve())

         return { id: sessionId } as Awaited<ReturnType<typeof TaskService.request>>
      })

      // A read named Ada after she was invited: the invite goes with that name, and the note is filled from it.
      await db.person.updateMany({
         where: {
            userId,
            slug: 'ada-l',
         },
         data: { name: 'Ada Lovelace' },
      })

      await expect(LinkedInInviteService.dispatchNext(accountId)).resolves.toEqual({ asked: true })
      expect(request.mock.calls[0]?.[0]).toMatchObject({
         task: 'linkedin-invite',
         input: { withdraw: [] },
      })
      expect((request.mock.calls[0]?.[0].input as { send: unknown[] }).send).toHaveLength(3)
      expect((request.mock.calls[0]?.[0].input as { send: unknown[] }).send).toContainEqual({
         id: (await invitesOf('ada-l'))[0]?.id,
         slug: 'ada-l',
         name: 'Ada Lovelace',
         note: 'Hi Ada',
      })
      expect((await invitesOf('ada-l'))[0]).toMatchObject({
         name: 'Ada Lovelace',
         note: 'Hi Ada',
      })
      // A run is going: nothing else starts.
      await expect(LinkedInInviteService.dispatchNext(accountId)).resolves.toMatchObject({ asked: false })
      request.mockRestore()

      const [ada] = await invitesOf('ada-l')
      const [grace] = await invitesOf('grace-h')
      const [alan] = await invitesOf('alan-t')

      await LinkedInInviteService.store(sessionId, {
         contract: 2,
         captured_at: new Date().toISOString(),
         sent: [
            {
               id: ada?.id ?? '',
               outcome: 'SENT_WITHOUT_NOTE',
               memberId: '42',
            },
            {
               id: grace?.id ?? '',
               outcome: 'NOT_SENT',
            },
            {
               id: alan?.id ?? '',
               outcome: 'NO_CONNECT',
            },
         ],
         withdrawn: [],
      })

      expect((await invitesOf('ada-l'))[0]).toMatchObject({
         state: 'SENT',
         memberId: '42',
         note: 'Hi Ada',
         reason: 'Sent without the note: no free notes left this month.',
      })
      expect((await invitesOf('grace-h'))[0]).toMatchObject({
         state: 'QUEUED',
         tries: 1,
      })
      expect((await invitesOf('alan-t'))[0]).toMatchObject({ state: 'FAILED' })

      // LinkedIn refused a note: the account's next run is told its notes are out.
      const next = vi
         .spyOn(TaskService, 'request')
         .mockResolvedValueOnce({ id: randomUUID() } as Awaited<ReturnType<typeof TaskService.request>>)

      await LinkedInInviteService.dispatchNext(accountId)
      expect(next.mock.calls[0]?.[0].input).toMatchObject({ notesOut: true })
      next.mockRestore()

      await PeopleIndexService.refresh(userId, SLUGS)

      expect(
         await db.person.findFirst({
            where: {
               userId,
               slug: 'ada-l',
            },
         })
      ).toMatchObject({
         status: 'CONTACTED',
         waiting: true,
         priority: 0,
      })
   })

   it('should mark an invite accepted when the person shows among new connections, and count it in the results', async () => {
      await expect(LinkedInInviteService.markAccepted(accountId, ['Ada-L'])).resolves.toBe(1)
      expect((await invitesOf('ada-l'))[0]).toMatchObject({ state: 'ACCEPTED' })

      expect(await PeopleService.results(userId, 30)).toMatchObject({
         invited: 1,
         accepted: 1,
         bySource: [
            {
               name: 'Post commenters',
               invited: 1,
               accepted: 1,
            },
         ],
      })
   })

   it('should never withdraw an invite on its own, however long it is pending, and not plan the person again', async () => {
      const [grace] = await invitesOf('grace-h')

      await db.linkedInInvite.update({
         where: { id: grace?.id ?? '' },
         data: {
            state: 'SENT',
            invitedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
         },
      })
      vi.spyOn(TaskService, 'request').mockRejectedValueOnce(new Error('not in this test'))

      await LinkedInInviteService.dispatchWaiting().catch(() => undefined)

      expect((await invitesOf('grace-h'))[0]).toMatchObject({ state: 'SENT' })
      expect(
         await db.linkedInInvite.count({
            where: {
               userId,
               state: { in: ['WITHDRAW_QUEUED', 'WITHDRAWING'] },
            },
         })
      ).toBe(0)

      const again = await LinkedInInviteService.invite(userId, { personIds: [await personId('grace-h')] })

      expect(again.queued).toBe(0)
      expect((await invitesOf('grace-h')).at(-1)).toMatchObject({
         state: 'SKIPPED',
         reason: 'An invite is still pending.',
      })
      vi.restoreAllMocks()
   })

   it('should pause new invites of an account with 2,850 pending, and say so', async () => {
      const crowded = (
         await db.linkedInAccount.create({
            data: {
               userId: otherUserId,
               email: `${randomUUID()}@example.com`,
               secret: 'x',
               secretIv: 'x',
               secretTag: 'x',
               status: 'ACTIVE',
               lastVerifiedAt: new Date(),
            },
         })
      ).id

      await db.linkedInInvite.createMany({
         data: Array.from({ length: 2850 }, (_, index) => ({
            userId: otherUserId,
            accountId: crowded,
            slug: `crowd-${index}`,
            name: `Crowd ${index}`,
            state: 'SENT' as const,
            plannedAt: new Date(),
            invitedAt: new Date(),
            startedAt: new Date(),
         })),
      })
      await db.linkedInInvite.create({
         data: {
            userId: otherUserId,
            accountId: crowded,
            slug: 'waiting-w',
            name: 'Waiting W',
            state: 'QUEUED',
            plannedAt: new Date(Date.now() - 1000),
         },
      })

      await expect(LinkedInInviteService.dispatchNext(crowded)).resolves.toEqual({
         asked: false,
         reason: 'Too many pending invites',
      })
      await expect(LinkedInInviteService.plan(otherUserId, { personIds: [] })).rejects.toThrow(
         'too many pending invites'
      )
   })

   it('should take back a queued invite only', async () => {
      const [alan] = await invitesOf('alan-t')

      expect(await LinkedInInviteService.cancel(userId, alan?.id ?? '')).toBe(false)
   })

   it('should give an invite asked before a name was known the name My network has, and never take its address as a name', async () => {
      const [grace] = await invitesOf('grace-h')

      await db.linkedInInvite.update({
         where: { id: grace?.id ?? '' },
         data: { name: 'grace-h' },
      })
      await PeopleIndexService.refresh(userId, ['grace-h'])

      expect((await invitesOf('grace-h'))[0]?.name).toBe('grace-h Person')
      expect(
         await db.person.findFirst({
            where: {
               userId,
               slug: 'grace-h',
            },
            select: { name: true },
         })
      ).toEqual({ name: 'grace-h Person' })
   })

   it("should invite people a block holds from one of the owner's accounts, and put them in My network", async () => {
      const links = [
         {
            slug: 'zed-n',
            name: 'Zed N',
            company: 'Acme',
         },
         {
            slug: 'yan-q',
            name: null,
            company: null,
         },
         {
            slug: 'mary-s',
            name: 'Mary S',
            company: null,
         },
      ]

      expect(await LinkedInInviteService.inviteFrom(otherUserId, accountId, links, '')).toBeNull()

      const made = await LinkedInInviteService.inviteFrom(userId, accountId, links, 'Hi {first_name}')

      expect(made?.outcomes).toEqual([
         expect.objectContaining({
            slug: 'zed-n',
            state: 'QUEUED',
            reason: null,
         }),
         expect.objectContaining({
            slug: 'yan-q',
            state: 'QUEUED',
         }),
         expect.objectContaining({
            slug: 'mary-s',
            state: 'SKIPPED',
            reason: 'A connection request is pending.',
         }),
      ])
      expect((await invitesOf('zed-n'))[0]).toMatchObject({
         state: 'QUEUED',
         accountId,
         name: 'Zed N',
      })

      await PeopleIndexService.refresh(userId, ['zed-n'])

      expect(
         await db.person.count({
            where: {
               userId,
               slug: 'zed-n',
            },
         })
      ).toBe(1)
   })

   it('should cancel an invite that has not gone, queue a sent one for withdrawal, and touch only the owner’s own', async () => {
      const [yan] = await invitesOf('yan-q')

      await db.linkedInInvite.update({
         where: { id: yan?.id ?? '' },
         data: {
            state: 'SENT',
            invitedAt: new Date(),
         },
      })

      expect(await LinkedInInviteService.withdraw(otherUserId, [accountId], ['zed-n', 'yan-q'])).toEqual(new Map())

      const taken = await LinkedInInviteService.withdraw(userId, [accountId], ['zed-n', 'yan-q', 'nobody'])

      expect(taken).toEqual(
         new Map([
            [
               'zed-n',
               {
                  accountId,
                  taken: 'CANCELLED',
               },
            ],
            [
               'yan-q',
               {
                  accountId,
                  taken: 'QUEUED',
               },
            ],
         ])
      )
      expect((await invitesOf('zed-n'))[0]).toMatchObject({ state: 'CANCELLED' })
      expect((await invitesOf('yan-q'))[0]).toMatchObject({ state: 'WITHDRAW_QUEUED' })
   })
})
