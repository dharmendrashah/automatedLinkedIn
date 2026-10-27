import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { INVITATIONS_CONTRACT_VERSION, type InvitationsFile } from '@automatedLinkedIn/contracts'

import { linkedInInvitationHooks } from './linkedInInvitation.hooks'
import { LinkedInInvitationService } from './linkedInInvitation.service'
import { PrismaService } from './prisma.service'
import { SpiderSessionService } from './spiderSession.service'
import { TaskService } from './task.service'
import { BrowseBudgetError, TaskBusyError, TaskRefusedError } from './taskErrors'
import { UserService } from './user.service'

// Needs PostgreSQL. The task itself is not started: `TaskService.request` is replaced by a stand-in that saves what the service asks
// to save in the run's transaction, as the real one does.

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

let userId: string
let otherUserId: string
let accountId: string
let secondAccountId: string
let otherAccountId: string

const person = (n: number) => ({
   id: `75207529307029831${String(n).padStart(2, '0')}`,
   slug: `person-${n}`,
   name: `Person ${n}`,
   headline: `Works at ${n}`,
})

const file = (listed: number[], rest: Partial<InvitationsFile> = {}): InvitationsFile => ({
   contract: INVITATIONS_CONTRACT_VERSION,
   captured_at: new Date().toISOString(),
   complete: true,
   invitations: listed.map(person),
   outcomes: [],
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
   PrismaService.client.linkedInInvitation.findMany({
      where: { accountId },
      orderBy: { position: 'asc' },
   })

const requested: Array<{ task: string; input: Record<string, unknown> }> = []

const startRun = (id: string) =>
   SpiderSessionService.startTask({
      id,
      userId,
      linkedInAccountId: accountId,
      task: 'linkedin-invitations',
      taskVersion: 1,
      trigger: 'manual',
      input: {},
      startedAt: new Date(),
   })

const read = (listed: number[], rest: Partial<InvitationsFile> = {}) =>
   LinkedInInvitationService.store(
      {
         userId,
         accountId,
      },
      file(listed, rest),
      {
         id: randomUUID(),
         verdict: 'DONE',
      }
   )

describe('LinkedInInvitationService (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherUserId = (await UserService.create({ email: otherEmail })).id
      accountId = (await makeAccount(userId)).id
      secondAccountId = (await makeAccount(userId)).id
      otherAccountId = (await makeAccount(otherUserId)).id
   })

   beforeEach(async () => {
      await PrismaService.client.linkedInInvitation.deleteMany({ where: { userId } })
      await PrismaService.client.linkedInAccount.updateMany({
         where: { id: { in: [accountId, secondAccountId] } },
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

   it('should store the requests in the order of the page, once, and note when they were read and how many LinkedIn counts', async () => {
      await read([3, 1, 2], { total: 7 })
      await read([3, 1, 2], { total: 7 })

      expect((await rows()).map(({ linkedInId }) => linkedInId)).toEqual([person(3).id, person(1).id, person(2).id])

      const account = await PrismaService.client.linkedInAccount.findUniqueOrThrow({ where: { id: accountId } })

      expect(account.invitationsTotal).toBe(7)
      expect(account.invitationsReadAt).not.toBeNull()
   })

   it('should show the owner their requests by brain’s id, never LinkedIn’s number, and nobody else’s', async () => {
      await read([1, 2], { total: 5 })

      const snapshot = await LinkedInInvitationService.list(userId, [accountId])

      expect(snapshot?.accounts[0]).toMatchObject({
         accountId,
         total: 5,
         reading: false,
         answeredToday: 0,
      })
      expect(snapshot?.requests.map(({ state }) => state)).toEqual(['WAITING', 'WAITING'])
      expect(JSON.stringify(snapshot)).not.toContain(person(1).id)
      expect(await LinkedInInvitationService.list(otherUserId, [accountId])).toBeNull()
      expect(await LinkedInInvitationService.waiting(userId, [accountId, otherAccountId])).toEqual({ [accountId]: 2 })
   })

   it('should list several accounts at once in the order asked, each request with its account, and leave a foreign account out', async () => {
      await read([1, 2])
      await PrismaService.client.linkedInInvitation.create({
         data: {
            userId,
            accountId: secondAccountId,
            linkedInId: person(9).id,
            slug: 'person-9',
            name: 'Person 9',
            headline: '',
         },
      })

      const list = await LinkedInInvitationService.list(userId, [secondAccountId, accountId, otherAccountId])

      expect(list?.accounts.map(account => account.accountId)).toEqual([secondAccountId, accountId])
      expect(list?.requests.map(request => request.accountId)).toEqual([secondAccountId, accountId, accountId])
      expect(list?.cut).toBe(false)
      expect(await LinkedInInvitationService.list(userId, [otherAccountId])).toBeNull()
   })

   it('should say when the next automatic read of each account is due, and nothing for one without a time yet', async () => {
      const next = new Date('2026-10-28T08:42:00.000Z')

      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: { nextInvitationsAt: next },
      })

      const list = await LinkedInInvitationService.list(userId, [accountId, secondAccountId])

      expect(list?.accounts.map(account => account.nextCheckAt)).toEqual([next.toISOString(), null])
   })

   it('should say the account is signed out when it is not signed in any more', async () => {
      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: { status: 'NEEDS_REAUTH' },
      })

      expect((await LinkedInInvitationService.list(userId, [accountId]))?.accounts[0]?.problem).toBe('SIGNED_OUT')
   })

   it('should queue the answers in the run’s own transaction and give the task LinkedIn’s numbers in the order asked', async () => {
      await read([1, 2, 3])

      const [first, second] = await rows()

      await LinkedInInvitationService.answer(userId, accountId, [
         {
            id: second?.id ?? '',
            action: 'IGNORE',
         },
         {
            id: first?.id ?? '',
            action: 'ACCEPT',
         },
      ])

      expect(requested[0]?.input).toEqual({
         answers: [
            {
               id: person(2).id,
               action: 'IGNORE',
            },
            {
               id: person(1).id,
               action: 'ACCEPT',
            },
         ],
      })
      expect((await rows()).map(({ status }) => status)).toEqual(['QUEUED', 'QUEUED', 'PENDING'])
      expect((await LinkedInInvitationService.list(userId, [accountId]))?.accounts[0]?.answeredToday).toBe(2)
   })

   it('should refuse a request that is not waiting, one of another owner, and an account that is not signed in', async () => {
      await read([1])

      const [row] = await rows()
      const ask = [
         {
            id: row?.id ?? '',
            action: 'ACCEPT' as const,
         },
      ]

      await LinkedInInvitationService.answer(userId, accountId, ask)
      await expect(LinkedInInvitationService.answer(userId, accountId, ask)).rejects.toBeInstanceOf(TaskRefusedError)
      expect(requested).toHaveLength(1)
      expect(await LinkedInInvitationService.answer(otherUserId, accountId, ask)).toBeNull()
      expect(await LinkedInInvitationService.answer(userId, otherAccountId, ask)).toBeNull()

      await PrismaService.client.linkedInAccount.update({
         where: { id: accountId },
         data: { status: 'NEEDS_REAUTH' },
      })
      await expect(LinkedInInvitationService.answer(userId, accountId, ask)).rejects.toBeInstanceOf(TaskRefusedError)
   })

   it('should refuse more than the account may answer in a day, with the number left', async () => {
      await read(Array.from({ length: 10 }, (_, index) => index + 1))

      const waiting = await rows()

      await PrismaService.client.linkedInInvitation.updateMany({
         where: { id: { in: waiting.slice(0, 5).map(({ id }) => id) } },
         data: {
            status: 'ACCEPTED',
            startedAt: new Date(),
         },
      })
      await PrismaService.client.linkedInInvitation.createMany({
         data: Array.from({ length: 41 }, (_, index) => ({
            userId,
            accountId,
            linkedInId: `9${String(index).padStart(18, '0')}`,
            slug: `old-${index}`,
            name: 'Old',
            headline: '',
            status: 'IGNORED' as const,
            startedAt: new Date(),
         })),
      })

      await expect(
         LinkedInInvitationService.answer(
            userId,
            accountId,
            waiting.slice(5, 10).map(({ id }) => ({
               id,
               action: 'IGNORE' as const,
            }))
         )
      ).rejects.toThrow('This account can answer 4 more today.')
   })

   it('should ask for a read with no answers for each account, and skip the ones that cannot be asked with the sentence', async () => {
      await PrismaService.client.linkedInAccount.update({
         where: { id: secondAccountId },
         data: { status: 'NEEDS_REAUTH' },
      })

      const result = await LinkedInInvitationService.refresh(userId, [accountId, secondAccountId, otherAccountId])

      expect(requested).toEqual([
         {
            task: 'linkedin-invitations',
            input: { answers: [] },
         },
      ])
      expect(result).toMatchObject({
         started: [accountId],
         skipped: [
            {
               accountId: secondAccountId,
               budget: false,
            },
         ],
      })
      expect(await LinkedInInvitationService.refresh(otherUserId, [accountId])).toBeNull()

      await PrismaService.client.linkedInAccount.update({
         where: { id: secondAccountId },
         data: { status: 'ACTIVE' },
      })
   })

   it('should not let an account the budget refuses stop the others, and count one that is busy as asked', async () => {
      const request = vi
         .spyOn(TaskService, 'request')
         .mockRejectedValueOnce(
            new BrowseBudgetError('Outside working hours.', 'OUTSIDE_OFFICE', new Date(), 'at 09:00')
         )
         .mockRejectedValueOnce(new TaskBusyError('Busy.'))

      const result = await LinkedInInvitationService.refresh(userId, [accountId, secondAccountId], true)

      expect(request).toHaveBeenCalledTimes(2)
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ startAnyway: true }))
      expect(result).toEqual({
         started: [secondAccountId],
         skipped: [
            {
               accountId,
               reason: 'Outside working hours.',
               budget: true,
            },
         ],
      })
   })

   it('should settle what a run was asked to answer from its file, and show a read in progress as reading', async () => {
      await read([1, 2, 3])

      const [first, second, third] = await rows()

      await LinkedInInvitationService.answer(userId, accountId, [
         {
            id: first?.id ?? '',
            action: 'ACCEPT',
         },
         {
            id: second?.id ?? '',
            action: 'IGNORE',
         },
         {
            id: third?.id ?? '',
            action: 'ACCEPT',
         },
      ])

      const where = { id: first?.id ?? '' }
      const { sessionId } = await PrismaService.client.linkedInInvitation.findUniqueOrThrow({ where })

      expect(sessionId).not.toBeNull()

      await LinkedInInvitationService.store(
         {
            userId,
            accountId,
         },
         file([3], {
            outcomes: [
               {
                  id: person(1).id,
                  action: 'ACCEPT',
                  outcome: 'ACCEPTED',
               },
               {
                  id: person(2).id,
                  action: 'IGNORE',
                  outcome: 'IGNORED',
               },
               {
                  id: person(3).id,
                  action: 'ACCEPT',
                  outcome: 'NOT_CLICKED',
               },
            ],
         }),
         {
            id: sessionId ?? '',
            verdict: 'PARTIAL',
         }
      )

      const settled = await PrismaService.client.linkedInInvitation.findMany({
         where: { accountId },
         orderBy: { linkedInId: 'asc' },
         select: { status: true },
      })

      expect(settled.map(({ status }) => status)).toEqual(['ACCEPTED', 'IGNORED', 'PENDING'])
   })

   it('should end the queued answers as failed or unsure by the verdict, and call a lost one unsure after a while', async () => {
      await read([1, 2])

      const [first, second] = await rows()

      await LinkedInInvitationService.answer(userId, accountId, [
         {
            id: first?.id ?? '',
            action: 'ACCEPT',
         },
      ])

      const sessionId =
         (await PrismaService.client.linkedInInvitation.findUniqueOrThrow({ where: { id: first?.id ?? '' } }))
            .sessionId ?? ''

      await PrismaService.client.$transaction(async tx => {
         await linkedInInvitationHooks.onResult?.(
            {
               id: sessionId,
               userId,
               linkedInAccountId: accountId,
            },
            {
               verdict: 'ERROR',
               message: 'It did not work.',
            } as never,
            tx
         )
      })

      expect((await rows())[0]).toMatchObject({
         status: 'FAILED',
         failure: 'It did not work.',
      })

      await PrismaService.client.linkedInInvitation.update({
         where: { id: second?.id ?? '' },
         data: {
            status: 'QUEUED',
            startedAt: new Date(Date.now() - 60 * 60 * 1000),
         },
      })

      expect(await LinkedInInvitationService.endStale()).toBeGreaterThanOrEqual(1)
      expect((await rows())[1]?.status).toBe('UNKNOWN')
   })
})
