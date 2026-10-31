import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ClientService } from './client.service'
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
let clientId: string
let accountId: string

const personId = async (slug: string) =>
   (
      await db.person.findFirstOrThrow({
         where: {
            clientId,
            slug,
         },
         select: { id: true },
      })
   ).id

const invitesOf = (slug: string) =>
   db.linkedInInvite.findMany({
      where: {
         clientId,
         slug,
      },
      orderBy: { createdAt: 'asc' },
   })

describe('LinkedInInviteService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      otherUserId = (await UserService.create({ email: `${randomUUID()}@elitale.com` })).id
      clientId = (await ClientService.create(userId, 'Acme')).id
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
               clientId,
            },
         })
      ).id

      const list = await WorkflowListService.createList(userId, 'Post commenters')

      await db.workflowList.update({
         where: { id: list.id },
         data: { clientId },
      })

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
               clientId,
               slug: 'ada-l',
            },
         })
      ).toMatchObject({ priority: 1 })
      expect(
         await db.person.findFirst({
            where: {
               clientId,
               slug: 'mary-s',
            },
         })
      ).toMatchObject({ priority: 2 })
   })

   it("should plan without queuing, skip a person with a request, and refuse another owner's client", async () => {
      const ids = await Promise.all(SLUGS.map(personId))
      const plan = await LinkedInInviteService.plan(userId, {
         clientId,
         personIds: ids,
      })

      expect(plan).toMatchObject({
         accountId,
         today: 20,
         toInvite: 3,
         unnamed: 0,
         skipped: { REQUEST: 1 },
      })
      expect(plan?.sentence).toBe(
         'You can safely send 20 today. 4 selected: all today. Skipped: 1 with a request pending.'
      )
      expect(await db.linkedInInvite.count({ where: { clientId } })).toBe(0)
      expect(
         await LinkedInInviteService.plan(otherUserId, {
            clientId,
            personIds: ids,
         })
      ).toBeNull()
   })

   it('should queue invites with the note as written, and skip people invited already on a second ask', async () => {
      const ids = await Promise.all(SLUGS.slice(0, 3).map(personId))

      await expect(
         LinkedInInviteService.invite(userId, {
            clientId,
            personIds: ids,
            note: 'Hi {first_name}',
         })
      ).resolves.toMatchObject({ queued: 3 })
      expect((await invitesOf('ada-l'))[0]).toMatchObject({
         state: 'QUEUED',
         note: 'Hi {first_name}',
         accountId,
      })
      expect(
         (
            await LinkedInInviteService.invite(userId, {
               clientId,
               personIds: ids,
            })
         )?.queued
      ).toBe(0)
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
            clientId,
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
         contract: 1,
         captured_at: new Date().toISOString(),
         sent: [
            {
               id: ada?.id ?? '',
               outcome: 'SENT',
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
      })
      expect((await invitesOf('grace-h'))[0]).toMatchObject({
         state: 'QUEUED',
         tries: 1,
      })
      expect((await invitesOf('alan-t'))[0]).toMatchObject({ state: 'FAILED' })

      await PeopleIndexService.refresh(userId, SLUGS)

      expect(
         await db.person.findFirst({
            where: {
               clientId,
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

      expect(await PeopleService.results(userId, clientId, 30)).toMatchObject({
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

   it('should move an invite pending 3 weeks to be withdrawn', async () => {
      const [grace] = await invitesOf('grace-h')

      await db.linkedInInvite.update({
         where: { id: grace?.id ?? '' },
         data: {
            state: 'SENT',
            invitedAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000),
         },
      })
      vi.spyOn(TaskService, 'request').mockRejectedValueOnce(new Error('not in this test'))

      await LinkedInInviteService.dispatchWaiting().catch(() => undefined)

      expect((await invitesOf('grace-h'))[0]).toMatchObject({ state: 'WITHDRAW_QUEUED' })
      vi.restoreAllMocks()
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
               clientId,
               slug: 'grace-h',
            },
            select: { name: true },
         })
      ).toEqual({ name: 'grace-h Person' })
   })
})
