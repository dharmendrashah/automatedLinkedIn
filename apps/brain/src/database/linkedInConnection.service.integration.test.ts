import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CONNECTIONS_CONTRACT_VERSION, CONNECTION_LIMITS, type ConnectionsFile } from '@automatedLinkedIn/contracts'

import { linkedInConnectionHooks } from './linkedInConnection.hooks'
import { LinkedInConnectionService } from './linkedInConnection.service'
import { PrismaService } from './prisma.service'
import { SpiderSessionService } from './spiderSession.service'
import { TaskService } from './task.service'
import { BrowseBudgetError, TaskBusyError } from './taskErrors'
import { UserService } from './user.service'

// Needs PostgreSQL. The task itself is not started: `TaskService.request` is replaced by a stand-in that saves what the service asks
// to save in the run's transaction, as the real one does.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

let userId: string
let otherUserId: string
let accountId: string
let otherAccountId: string

const person = (n: number) => ({
   slug: `person-${n}`,
   name: `Person ${n}`,
   headline: `Works at ${n}`,
   connectedOn: '2026-10-27',
   messageUrn: `urn:li:fsd_profile:ACoAA${n}`,
})

const file = (listed: number[], rest: Partial<ConnectionsFile> = {}): ConnectionsFile => ({
   contract: CONNECTIONS_CONTRACT_VERSION,
   captured_at: new Date().toISOString(),
   complete: true,
   connections: listed.map(person),
   ...rest,
})

const makeAccount = (id: string, status: 'ACTIVE' | 'NEEDS_REAUTH' = 'ACTIVE') =>
   PrismaService.client.linkedInAccount.create({
      data: {
         userId: id,
         email: `${randomUUID()}@example.com`,
         secret: 'x',
         secretIv: 'x',
         secretTag: 'x',
         status,
      },
   })

const rows = () =>
   PrismaService.client.linkedInConnection.findMany({
      where: { accountId },
      orderBy: { position: 'asc' },
   })

const byNumber = (n: number) =>
   PrismaService.client.linkedInConnection.findFirstOrThrow({
      where: {
         accountId,
         slug: person(n).slug,
      },
   })

const requested: Array<{ task: string; input: Record<string, unknown> }> = []

const startRun = (id: string) =>
   SpiderSessionService.startTask({
      id,
      userId,
      linkedInAccountId: accountId,
      task: 'linkedin-connections',
      taskVersion: 1,
      trigger: 'manual',
      input: {},
      startedAt: new Date(),
   })

const read = (
   listed: number[],
   rest: Partial<ConnectionsFile> = {},
   sessionId: string = randomUUID(),
   verdict = 'DONE'
) =>
   LinkedInConnectionService.store(
      {
         userId,
         accountId,
      },
      file(listed, rest),
      {
         id: sessionId,
         verdict,
      }
   )

describe('LinkedInConnectionService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      accountId = (await makeAccount(userId)).id
      otherAccountId = (await makeAccount(otherUserId)).id
   })

   beforeEach(async () => {
      await PrismaService.client.linkedInConnection.deleteMany({ where: { userId } })
      await PrismaService.client.linkedInConversation.deleteMany({ where: { userId } })
      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: { status: 'ACTIVE' },
      })
      requested.length = 0
      vi.spyOn(TaskService, 'request').mockImplementation(async options => {
         const id = randomUUID()

         requested.push({
            task: options.task,
            input: options.input ?? {},
         })
         await startRun(id)
         await PrismaService.client.$transaction(async tx => {
            await options.onStart?.(id, tx)
         })

         return { id }
      })
   })

   afterAll(async () => {
      vi.restoreAllMocks()
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should store the connections in the order of the page, once, with the day they connected, and note when they were read and how many LinkedIn counts', async () => {
      await read([3, 1, 2], { total: 3 })
      await read([3, 1, 2], { total: 3 })

      const stored = await rows()

      expect(stored.map(({ slug }) => slug)).toEqual([person(3).slug, person(1).slug, person(2).slug])
      expect(stored[0]?.connectedOn?.toISOString()).toBe('2026-10-27T00:00:00.000Z')

      const account = await PrismaService.client.linkedInAccount.findUniqueOrThrow({ where: { id: accountId } })

      expect(account.connectionsTotal).toBe(3)
      expect(account.connectionsReadAt).not.toBeNull()
   })

   it('should show the owner their connections, with the conversation they have with each, and nobody else’s', async () => {
      await read([1, 2], { total: 2 })
      await PrismaService.client.linkedInConversation.create({
         data: {
            userId,
            accountId,
            linkedInId: '2-one',
            title: 'Person 1',
            kind: 'DIRECT',
            participants: [
               {
                  name: 'Person 1',
                  profileUrl: 'https://www.linkedin.com/in/person-1/',
               },
            ],
            unread: false,
            complete: true,
         },
      })

      const snapshot = await LinkedInConnectionService.list(userId, accountId)

      expect(snapshot?.account).toMatchObject({
         accountId,
         total: 2,
         reading: false,
         removedToday: 0,
         removeLeft: CONNECTION_LIMITS.removePerDay,
      })
      expect(snapshot?.connections.map(({ slug, state }) => [slug, state])).toEqual([
         ['person-1', 'CONNECTED'],
         ['person-2', 'CONNECTED'],
      ])
      expect(snapshot?.connections[0]?.conversationId).toEqual(expect.any(String))
      expect(snapshot?.connections[1]?.conversationId).toBeUndefined()
      expect(snapshot?.connections[0]).toMatchObject({
         connectedOn: '2026-10-27',
         messageUrn: 'urn:li:fsd_profile:ACoAA1',
      })
      expect(await LinkedInConnectionService.list(otherUserId, accountId)).toBeNull()
      expect(await LinkedInConnectionService.list(userId, otherAccountId)).toBeNull()
   })

   it('should list the connections of all the owner’s accounts for New message, with their conversation and the do-not-contact mark', async () => {
      await read([1, 2, 3, 4], { total: 4 })
      await PrismaService.client.linkedInConnection.updateMany({
         where: {
            accountId,
            slug: person(4).slug,
         },
         data: { status: 'REMOVED' },
      })
      await PrismaService.client.linkedInConversation.create({
         data: {
            userId,
            accountId,
            linkedInId: '2-one',
            title: 'Person 1',
            kind: 'DIRECT',
            participants: [
               {
                  name: 'Person 1',
                  profileUrl: 'https://www.linkedin.com/in/person-1/',
               },
            ],
            unread: false,
            complete: true,
         },
      })
      await PrismaService.client.suppression.create({
         data: {
            userId,
            slug: person(3).slug,
         },
      })

      const all = await LinkedInConnectionService.recipients(userId, '')

      expect(all.map(({ slug }) => slug).sort()).toEqual(['person-1', 'person-2', 'person-3'])
      expect(all.every(item => item.accountId === accountId)).toBe(true)
      expect(all.find(({ slug }) => slug === 'person-1')?.conversationId).toEqual(expect.any(String))
      expect(all.find(({ slug }) => slug === 'person-2')).toEqual({
         accountId,
         slug: 'person-2',
         name: 'Person 2',
         headline: 'Works at 2',
      })
      expect(all.find(({ slug }) => slug === 'person-3')?.blocked).toBe('DO_NOT_CONTACT')
      expect((await LinkedInConnectionService.recipients(userId, 'works 2')).map(({ slug }) => slug)).toEqual([
         'person-2',
      ])
      expect(await LinkedInConnectionService.recipients(otherUserId, '')).toEqual([])

      await PrismaService.client.suppression.deleteMany({ where: { userId } })
   })

   it('should find the conversation a first message began, though LinkedIn names the person in it by member id', async () => {
      await read([1], { total: 1 })

      const begun = await PrismaService.client.linkedInConversation.create({
         data: {
            userId,
            accountId,
            linkedInId: '2-begun',
            title: 'Person 1',
            kind: 'DIRECT',
            participants: [
               {
                  name: 'Person 1',
                  profileUrl: 'https://www.linkedin.com/in/ACoAAmember',
               },
            ],
            unread: false,
            complete: false,
         },
      })

      await PrismaService.client.linkedInReply.create({
         data: {
            userId,
            accountId,
            conversationId: begun.id,
            text: 'Hello',
            state: 'SENT',
            recipientSlug: person(1).slug,
            recipientName: person(1).name,
         },
      })

      expect(
         (await LinkedInConnectionService.recipients(userId, '')).map(({ conversationId }) => conversationId)
      ).toEqual([begun.id])
      await expect(LinkedInConnectionService.conversationWith(userId, accountId, person(1).slug)).resolves.toBe(
         begun.id
      )

      await PrismaService.client.linkedInReply.deleteMany({ where: { userId } })
   })

   it('should ask for a read of an account that is signed in, say so when it is not, and answer like a missing account for someone else’s', async () => {
      await expect(LinkedInConnectionService.refresh(userId, accountId)).resolves.toEqual({ started: true })
      expect(requested).toEqual([
         {
            task: 'linkedin-connections',
            input: {},
         },
      ])

      await expect(LinkedInConnectionService.refresh(otherUserId, accountId)).resolves.toBeNull()

      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: { status: 'NEEDS_REAUTH' },
      })

      await expect(LinkedInConnectionService.refresh(userId, accountId)).rejects.toThrow(/signed in/)
   })

   it('should count a read that is already going as asked, and pass on a refusal of the browse budget', async () => {
      const request = vi.mocked(TaskService.request)

      request.mockRejectedValueOnce(new TaskBusyError('Busy.'))
      await expect(LinkedInConnectionService.refresh(userId, accountId)).resolves.toEqual({ started: true })

      request.mockRejectedValueOnce(new BrowseBudgetError('Resting.', 'GAP', new Date(), 'at 17:53'))
      await expect(LinkedInConnectionService.refresh(userId, accountId)).rejects.toBeInstanceOf(BrowseBudgetError)
   })

   describe('removing', () => {
      beforeEach(async () => {
         await read([1, 2, 3], { total: 3 })
      })

      it('should ask the spider to remove one connection, by its address, and hold it as REMOVING in the same transaction', async () => {
         const target = await byNumber(2)

         const started = await LinkedInConnectionService.remove(userId, accountId, target.id)

         expect(started).toEqual({ started: true })

         expect(requested).toEqual([
            {
               task: 'linkedin-connections',
               input: { remove: 'person-2' },
            },
         ])
         await expect(byNumber(2)).resolves.toMatchObject({
            status: 'REMOVING',
            sessionId: expect.any(String),
            startedAt: expect.any(Date),
         })
      })

      it('should refuse a connection that is not on the list any more, one that is being removed, and one of someone else’s', async () => {
         const target = await byNumber(1)

         await LinkedInConnectionService.remove(userId, accountId, target.id)

         await expect(LinkedInConnectionService.remove(userId, accountId, target.id)).rejects.toThrow(/not on the list/)
         await expect(LinkedInConnectionService.remove(otherUserId, accountId, target.id)).resolves.toBeNull()
         await expect(LinkedInConnectionService.remove(userId, accountId, randomUUID())).resolves.toBeNull()
      })

      it('should keep the rest between two removals and the daily limit, and ask nothing when it refuses', async () => {
         const first = await byNumber(1)
         const second = await byNumber(2)

         await LinkedInConnectionService.remove(userId, accountId, first.id)
         await expect(LinkedInConnectionService.remove(userId, accountId, second.id)).rejects.toThrow(
            /Wait \d+ seconds/
         )

         await PrismaService.client.linkedInConnection.update({
            where: { id: first.id },
            data: {
               startedAt: new Date(Date.now() - 60_000),
               status: 'REMOVED',
            },
         })
         await PrismaService.client.linkedInConnection.createMany({
            data: Array.from({ length: CONNECTION_LIMITS.removePerDay }, (_, index) => ({
               userId,
               accountId,
               slug: `removed-${index}`,
               name: 'Removed',
               headline: '',
               status: 'REMOVED' as const,
               startedAt: new Date(Date.now() - 3_600_000),
            })),
         })

         await expect(LinkedInConnectionService.remove(userId, accountId, second.id)).rejects.toThrow(
            /used its removals for today/
         )
         expect(requested).toHaveLength(1)
      })

      it('should settle the connection from the file of the run that removed it, and bring it back when nothing was pressed', async () => {
         const target = await byNumber(2)

         await LinkedInConnectionService.remove(userId, accountId, target.id)

         const { sessionId } = await byNumber(2)

         await read(
            [1, 2, 3],
            {
               complete: false,
               removal: {
                  slug: 'person-2',
                  outcome: 'REMOVED',
               },
            },
            sessionId ?? ''
         )
         await expect(byNumber(2)).resolves.toMatchObject({
            status: 'REMOVED',
            removedAt: expect.any(Date),
         })

         // Imported again: nothing more changes, and a complete read that no longer lists the person leaves them removed.
         await read([1, 3], { total: 2 }, sessionId ?? '')
         await expect(byNumber(2)).resolves.toMatchObject({ status: 'REMOVED' })
      })

      it('should end the removal as unsure when the run is lost, and as failed when the verdict says nothing was pressed', async () => {
         const target = await byNumber(1)

         await LinkedInConnectionService.remove(userId, accountId, target.id)

         const { sessionId } = await byNumber(1)

         await PrismaService.client.$transaction(async tx => {
            await linkedInConnectionHooks.onResult?.(
               {
                  id: sessionId ?? '',
                  userId,
                  linkedInAccountId: accountId,
               },
               {
                  verdict: 'ERROR',
                  message: 'The connections could not be read.',
               } as never,
               tx
            )
         })
         await expect(byNumber(1)).resolves.toMatchObject({
            status: 'FAILED',
            failure: 'The connections could not be read.',
         })

         await PrismaService.client.linkedInConnection.update({
            where: { id: target.id },
            data: {
               status: 'REMOVING',
               startedAt: new Date(Date.now() - 2 * 3_600_000),
            },
         })
         await expect(LinkedInConnectionService.endStale()).resolves.toBeGreaterThanOrEqual(1)
         await expect(byNumber(1)).resolves.toMatchObject({ status: 'UNKNOWN' })
      })
   })

   it('should call a person gone only after a complete read that no longer lists them', async () => {
      await read([1, 2, 3], { total: 3 })
      await read([1], {
         total: 3,
         complete: false,
      })

      expect((await rows()).every(({ status }) => status === 'CONNECTED')).toBe(true)

      await read([1, 3], { total: 2 })

      await expect(byNumber(2)).resolves.toMatchObject({
         status: 'GONE',
         goneAt: expect.any(Date),
      })
   })
})
