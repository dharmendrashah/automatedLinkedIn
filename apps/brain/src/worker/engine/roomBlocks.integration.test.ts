import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CryptoService } from 'core'
import { fakeDataClient } from 'core/fakeDataClient'

import { PrismaService, RoomTodayService, UserService, WalletService, WorkflowService } from 'database'
import { AccountLimitsService } from 'database/accountLimits.service'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. Nothing is asked of the spider or the data service.

const email = `${randomUUID()}@elitale.com`
const HOUR_MS = 60 * 60 * 1000
const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`

const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const line = (from: string, to: string) => ({
   from,
   to,
})

const deps = () => ({
   client: fakeDataClient(() => ({
      rows: [],
      costMicros: 0,
   })),
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
})

let userId: string

const account = async (status: 'ACTIVE' | 'DISABLED' = 'ACTIVE') => {
   const sealed = CryptoService.seal('{}')

   return (
      await PrismaService.client.linkedInAccount.create({
         data: {
            userId,
            email: `${randomUUID()}@example.com`,
            secret: sealed.ciphertext,
            secretIv: sealed.iv,
            secretTag: sealed.tag,
            status,
         },
      })
   ).id
}

const limitOf = async (accountId: string) =>
   (await AccountLimitsService.forAccount(accountId, ['invitesPerDay']))?.invitesPerDay ?? 0

const run = async (graph: Graph) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Gate ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const runId = (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `gate-${randomUUID()}`))?.id ?? ''

   await advanceRun(runId, deps())

   return runId
}

const itemsAt = async (runId: string, nodeId: string) =>
   PrismaService.client.workflowItem.findMany({
      where: {
         runId,
         nodeId,
      },
      orderBy: { slug: 'asc' },
   })

const stepMessage = async (runId: string, nodeId: string) =>
   (
      await PrismaService.client.workflowStepRun.findFirst({
         where: {
            runId,
            nodeId,
         },
      })
   )?.message

const reasonOf = (item: { data: unknown }) => (item.data as { result?: { reason?: string } }).result?.reason

const names = (count: number) => Array.from({ length: count }, (_, index) => `p${String(index).padStart(2, '0')}`)

const roomGraph = (links: string[], pool: string[], config: GraphNode['config'] = {}): Graph => ({
   nodes: [
      node('people', 'input.profiles', { links }),
      node('select', 'account.select', { accounts: pool }),
      node('room', 'process.room', config),
      node('else', 'logic.else'),
   ],
   edges: [line('people', 'select'), line('select', 'room'), line('room', 'else')],
})

const waitGraph = (links: string[], config: GraphNode['config']): Graph => ({
   nodes: [
      node('people', 'input.profiles', { links }),
      node('wait', 'logic.personWait', config),
      node('else', 'logic.else'),
   ],
   edges: [line('people', 'wait'), line('wait', 'else')],
})

describe('Fit to today\u2019s limit and Wait per person (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should pass on as many people as the account has room for today and leave the rest to Else', async () => {
      const id = await account()
      const limit = await limitOf(id)
      const runId = await run(roomGraph(names(limit + 3).map(profile), [id]))

      expect(await itemsAt(runId, 'room')).toHaveLength(limit)

      const rest = await itemsAt(runId, 'else')

      expect(rest).toHaveLength(3)
      expect(rest.every(item => reasonOf(item) === 'No room left today.')).toBe(true)
      expect(await stepMessage(runId, 'room')).toContain(
         `${limit + 3} in, ${limit} on, 3 to Else. Room today: ${limit}.`
      )
   })

   it('should take what the account already sent from the room, and add the room of every account', async () => {
      const busy = await account()
      const fresh = await account()
      const limit = await limitOf(busy)
      const other = await limitOf(fresh)

      await PrismaService.client.linkedInInvite.createMany({
         data: names(2).map(slug => ({
            userId,
            accountId: busy,
            slug: `sent-${slug}`,
            name: slug,
            state: 'SENT' as const,
            plannedAt: new Date(),
            startedAt: new Date(),
            invitedAt: new Date(),
         })),
      })

      const runId = await run(roomGraph(names(50).map(profile), [busy, fresh]))

      expect(await itemsAt(runId, 'room')).toHaveLength(limit - 2 + other)
   })

   it('should say how many invites fit inside the days asked for, by the planner\u2019s own numbers', async () => {
      const id = await account()
      const limit = await limitOf(id)
      const [today] = await RoomTodayService.forAccounts(userId, [id], 'invite')
      const [three] = await RoomTodayService.forAccounts(userId, [id], 'invite', new Date(), 3)

      expect(today).toMatchObject({
         left: limit,
         within: limit,
         limit,
         paused: false,
      })
      // The week holds at least 65 percent of 100, which three days of the day's limit never pass.
      expect(three).toMatchObject({
         left: limit,
         within: 3 * limit,
      })
   })

   it('should leave everything to Else when the account is not signed in', async () => {
      const id = await account('DISABLED')
      const runId = await run(roomGraph(names(3).map(profile), [id]))

      expect(await itemsAt(runId, 'room')).toHaveLength(0)
      expect((await itemsAt(runId, 'else')).map(reasonOf)).toEqual(Array(3).fill('No account is signed in.'))
   })

   it('should put the best score first, and the people with no score last', async () => {
      const id = await account()
      const limit = await limitOf(id)
      const runId = await run(roomGraph(names(limit + 1).map(profile), [id], { orderBy: 'score' }))

      // Nobody has a score here, so the order they arrived in is kept: the last one is the one left out.
      expect((await itemsAt(runId, 'else')).map(({ slug }) => slug)).toEqual([names(limit + 1).at(-1)])
   })

   it('should let a person through once the time since they connected has passed, and keep the others for Else', async () => {
      const db = PrismaService.client
      const now = Date.now()

      await db.person.createMany({
         data: [
            ['old', 72 * HOUR_MS],
            ['new', HOUR_MS],
         ].map(([slug, ago]) => ({
            userId,
            slug: String(slug),
            lastTouchAt: new Date(now),
            connectedAt: new Date(now - Number(ago)),
         })),
      })

      const runId = await run(
         waitGraph([profile('old'), profile('new'), profile('stranger')], {
            after: 'connected',
            atLeast: 1,
            atLeastUnit: 'days',
         })
      )

      expect((await itemsAt(runId, 'wait')).map(({ slug }) => slug)).toEqual(['old', 'stranger'])

      const rest = await itemsAt(runId, 'else')

      expect(rest.map(({ slug }) => slug)).toEqual(['new'])
      expect(rest.map(reasonOf)).toEqual(['Not due yet.'])
      expect(await stepMessage(runId, 'wait')).toBe('3 in, 2 on, 1 to Else (not due yet).')
   })

   it('should hold a person with no date when asked to, and count from the accept time of an invite', async () => {
      const db = PrismaService.client
      const id = await account()
      const now = Date.now()

      await db.linkedInInvite.createMany({
         data: [
            ['accepted-long', 30 * HOUR_MS],
            ['accepted-just', HOUR_MS / 2],
         ].map(([slug, ago]) => ({
            userId,
            accountId: id,
            slug: String(slug),
            name: String(slug),
            state: 'ACCEPTED' as const,
            plannedAt: new Date(now),
            acceptedAt: new Date(now - Number(ago)),
         })),
      })

      const runId = await run(
         waitGraph([profile('accepted-long'), profile('accepted-just'), profile('nobody')], {
            after: 'accepted',
            atLeast: 1,
            atLeastUnit: 'hours',
            ifNoDate: 'hold',
         })
      )

      expect((await itemsAt(runId, 'wait')).map(({ slug }) => slug)).toEqual(['accepted-long'])
      expect(Object.fromEntries((await itemsAt(runId, 'else')).map(item => [item.slug, reasonOf(item)]))).toEqual({
         'accepted-just': 'Not due yet.',
         nobody: 'No date yet.',
      })
   })
})
