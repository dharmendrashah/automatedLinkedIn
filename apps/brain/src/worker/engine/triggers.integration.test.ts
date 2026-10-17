import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
   IcpService,
   PrismaService,
   RetentionService,
   UserService,
   WalletService,
   WorkflowService,
   WorkflowTriggerService,
} from 'database'

import { type Graph, templateGraph } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent.

const email = `${randomUUID()}@elitale.com`

const employees = [
   {
      profileUrl: 'https://www.linkedin.com/in/ada-growth',
      firstName: 'Ada',
      lastName: 'Growth',
      headline: 'VP Growth at Acme',
      city: 'London',
   },
   {
      profileUrl: 'https://www.linkedin.com/in/bob-student',
      firstName: 'Bob',
      headline: 'Student',
   },
]

const fakeClient = () => ({
   balanceMicros: vi.fn(async () => 50_000_000),
   findJob: vi.fn(async () => null),
   collect: vi.fn(
      async (slug: string, _params: Record<string, unknown>, known: { onJobId: (id: string) => Promise<void> }) => {
         await known.onJobId(`job-${slug}`)

         return {
            jobId: `job-${slug}`,
            status: 'completed' as const,
            rows: slug === 'company-employees' ? employees : [],
            costMicros: 100_000,
            error: null,
         }
      }
   ),
})

const deps = (client: ReturnType<typeof fakeClient>) => ({
   client,
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
})

// The accounts template, started by API instead of by hand.
const apiGraph = (icpId: string): Graph => {
   const graph = templateGraph('accounts', {
      icpId,
      posts: 5,
      perPost: 25,
   })

   return {
      ...graph,
      nodes: graph.nodes.map(node =>
         node.type === 'trigger.manual'
            ? {
                 ...node,
                 type: 'trigger.api',
              }
            : node
      ),
   }
}

const afterGraph = (icpId: string, workflowId: string): Graph => ({
   nodes: [
      {
         id: 'after',
         type: 'trigger.workflow',
         config: { workflowId },
         position: {
            x: 0,
            y: 0,
         },
      },
      {
         id: 'score',
         type: 'score.icp',
         config: { icpId },
         position: {
            x: 240,
            y: 0,
         },
      },
      {
         id: 'list',
         type: 'output.list',
         config: {},
         position: {
            x: 480,
            y: 0,
         },
      },
   ],
   edges: [
      {
         from: 'after',
         to: 'score',
      },
      {
         from: 'score',
         to: 'list',
      },
   ],
})

let userId: string
let icpId: string
let first: { id: string; outputListId: string }
let second: { id: string; outputListId: string }

describe('workflow triggers and retention (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
      icpId = (
         await IcpService.create(userId, {
            name: 'Growth leaders',
            includeTitles: ['growth'],
            excludeTitles: ['student'],
            seniorities: ['VP'],
            industries: [],
            companySizes: [],
            locations: ['london'],
            problemKeywords: [],
         })
      ).id
      first = await WorkflowService.create(userId, {
         name: `Accounts ${randomUUID().slice(0, 8)}`,
         goal: null,
         graph: apiGraph(icpId),
      })
      second = await WorkflowService.create(userId, {
         name: `After ${randomUUID().slice(0, 8)}`,
         goal: null,
         graph: afterGraph(icpId, first.id),
      })
      await WorkflowService.update(userId, first.id, { enabled: true })
      await WorkflowService.update(userId, second.id, { enabled: true })
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should open the workflow only with its current token', async () => {
      const old = await WorkflowTriggerService.rotateToken(userId, first.id)
      const token = await WorkflowTriggerService.rotateToken(userId, first.id)

      await expect(WorkflowTriggerService.authorize(first.id, old ?? '')).resolves.toBeNull()
      await expect(WorkflowTriggerService.authorize(first.id, token ?? '')).resolves.toMatchObject({ id: first.id })
      await expect(WorkflowTriggerService.rotateToken(randomUUID(), first.id)).resolves.toBeNull()
   })

   it('should refuse a chain that would start itself', async () => {
      const problems = await WorkflowService.problems(userId, afterGraph(icpId, second.id), second.id)

      expect(problems).toEqual([expect.objectContaining({ nodeId: 'after' })])
      await expect(WorkflowService.problems(userId, afterGraph(icpId, first.id), second.id)).resolves.toEqual([])
   })

   it('should start one run per idempotency key, run the API input and start the listening workflow', async () => {
      const key = randomUUID()
      const input = { companies: ['https://www.linkedin.com/company/acme'] }
      const run = await WorkflowTriggerService.startFromApi(
         {
            ...first,
            userId,
         },
         input,
         key
      )
      const again = await WorkflowTriggerService.startFromApi(
         {
            ...first,
            userId,
         },
         input,
         key
      )

      expect(again?.id).toBe(run?.id)

      const client = fakeClient()

      await advanceRun(run?.id ?? '', deps(client))

      const done = await WorkflowService.run(userId, run?.id ?? '')
      const chained = await PrismaService.client.workflowRun.findFirst({ where: { workflowId: second.id } })

      expect(done?.status).toBe('SUCCEEDED')
      expect(client.collect).toHaveBeenCalledWith(
         'company-employees',
         expect.objectContaining({ companies: 'https://www.linkedin.com/company/acme' }),
         expect.anything()
      )
      expect(chained).toMatchObject({
         trigger: 'WORKFLOW',
         depth: 1,
      })

      await advanceRun(chained?.id ?? '', deps(client))

      const members = await PrismaService.client.workflowListMember.findMany({
         where: { listId: { in: [first.outputListId, second.outputListId] } },
         select: {
            listId: true,
            slug: true,
         },
      })

      // Handed over people are known, so being in the first list does not stop them in the second.
      expect(members).toEqual(
         expect.arrayContaining([
            {
               listId: first.outputListId,
               slug: 'ada-growth',
            },
            {
               listId: second.outputListId,
               slug: 'ada-growth',
            },
         ])
      )
      expect(members.some(({ slug }) => slug === 'bob-student')).toBe(false)
   })

   it('should mark people untouched for 180 days and delete them 30 days later', async () => {
      const listId = first.outputListId
      const member = await PrismaService.client.workflowListMember.findFirstOrThrow({ where: { listId } })
      const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      const find = () => PrismaService.client.workflowListMember.findUnique({ where: { id: member.id } })

      await PrismaService.client.workflowListMember.update({
         where: { id: member.id },
         data: { updatedAt: daysAgo(181) },
      })
      await RetentionService.run()
      await expect(find()).resolves.toMatchObject({ reviewAt: expect.any(Date) })

      await PrismaService.client.workflowListMember.update({
         where: { id: member.id },
         data: { reviewAt: daysAgo(31) },
      })
      await RetentionService.run()
      await expect(find()).resolves.toBeNull()
   })
})
