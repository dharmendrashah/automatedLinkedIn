import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CryptoService } from 'core'
import { fakeDataClient } from 'core/fakeDataClient'

import { OwnPagesService, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The own-page read blocks through the real engine, over what the stored reads hold; nothing is asked of LinkedIn.

const email = `${randomUUID()}@elitale.com`
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
let accountId: string

const run = async (graph: Graph) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Own ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const runId = (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `own-${randomUUID()}`))?.id ?? ''

   await advanceRun(runId, deps())

   return runId
}

type Data = { slug: string; facts?: Record<string, unknown>; result?: { reason: string } }

const itemsAt = async (runId: string, nodeId: string) =>
   (
      await PrismaService.client.workflowItem.findMany({
         where: {
            runId,
            nodeId,
         },
         orderBy: { slug: 'asc' },
      })
   ).map(({ data }) => data as unknown as Data)

const stepMessage = async (runId: string, nodeId: string) =>
   (
      await PrismaService.client.workflowStepRun.findFirst({
         where: {
            runId,
            nodeId,
         },
      })
   )?.message

describe('Get notifications and Get mutual connections (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)

      const sealed = CryptoService.seal('{}')

      accountId = (
         await PrismaService.client.linkedInAccount.create({
            data: {
               userId,
               email: `${randomUUID()}@example.com`,
               secret: sealed.ciphertext,
               secretIv: sealed.iv,
               secretTag: sealed.tag,
               status: 'ACTIVE',
            },
         })
      ).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should give the people behind the stored notifications of a signed-in account', async () => {
      await OwnPagesService.importNotifications(userId, accountId, {
         rows: [
            {
               kind: 'viewed',
               name: null,
               slug: 'ada',
               time: '2h',
            },
            {
               kind: 'mentioned',
               name: null,
               slug: 'bob',
               time: '2h',
            },
         ],
      })

      const runId = await run({
         nodes: [node('notes', 'account.getNotifications', { since: '24h' })],
         edges: [],
      })

      expect((await itemsAt(runId, 'notes')).map(({ slug, facts }) => [slug, facts?.['notification.kinds']])).toEqual([
         ['ada', 'viewed'],
      ])
      expect(await stepMessage(runId, 'notes')).toBe('1 account, 1 notification, 1 person.')
   })

   it('should add the stored mutual count to people it has a read for and send the rest to Else', async () => {
      await OwnPagesService.importMutual(userId, accountId, {
         people: [
            {
               slug: 'ada',
               count: 3,
               mutual: [
                  {
                     name: null,
                     slug: 'cy',
                  },
               ],
            },
         ],
      })

      const runId = await run({
         nodes: [
            node('people', 'input.profiles', { links: [profile('ada'), profile('bob')] }),
            node('mutual', 'account.getMutual'),
            node('else', 'logic.else'),
         ],
         edges: [line('people', 'mutual'), line('mutual', 'else')],
      })

      expect(
         (await itemsAt(runId, 'mutual')).map(({ slug, facts }) => [
            slug,
            facts?.['mutual.count'],
            facts?.['mutual.first'],
         ])
      ).toEqual([['ada', 3, 'cy']])
      expect((await itemsAt(runId, 'else')).map(({ slug, result }) => [slug, result?.reason])).toEqual([
         ['bob', 'Not read yet.'],
      ])
   })
})
