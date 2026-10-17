import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { IcpService, LinkedInPostService, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { flagshipGraph } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent.

const email = `${randomUUID()}@elitale.com`
const POST = 'https://www.linkedin.com/feed/update/urn:li:activity:7452924970042826753'

const comments = [
   {
      commenterName: 'Ada',
      commenterHeadline: 'VP Growth at Acme',
      commenterUrl: 'https://www.linkedin.com/in/ada-growth',
      commenterType: 'profile',
      commenterFollowers: 900,
      comment: 'Our pipeline is the problem',
   },
   {
      commenterName: 'Bob',
      commenterHeadline: 'Student',
      commenterUrl: 'https://www.linkedin.com/in/bob-student',
      commenterType: 'profile',
      comment: 'Nice',
   },
]
const reactions = [
   {
      reactorName: 'Cy',
      reactorHeadline: 'Growth marketer',
      reactorUrl: 'https://www.linkedin.com/in/cy-growth',
      reactorLocation: 'London',
   },
   {
      reactorName: 'Ada',
      reactorHeadline: 'VP Growth at Acme',
      reactorUrl: 'https://www.linkedin.com/in/ada-growth',
   },
]
const profiles = [
   {
      profileUrl: 'https://www.linkedin.com/in/ada-growth',
      firstName: 'Ada',
      lastName: 'Growth',
      headline: 'VP Growth at Acme',
      city: 'London',
      experience: [
         {
            position: 'VP Growth',
            companyName: 'Acme',
         },
      ],
   },
]

const fakeClient = () => ({
   balanceMicros: vi.fn(async () => 50_000_000),
   findJob: vi.fn(async () => null),
   collect: vi.fn(
      async (slug: string, _params: Record<string, unknown>, known: { onJobId: (id: string) => Promise<void> }) => {
         const rows = slug === 'post-comments' ? comments : slug === 'post-reactions' ? reactions : profiles

         await known.onJobId(`job-${slug}`)

         return {
            jobId: `job-${slug}`,
            status: 'completed' as const,
            rows,
            costMicros: rows.length * (slug === 'profiles' ? 4_000 : 2_000),
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

let userId: string
let workflowId: string
let outputListId: string

describe('workflow engine (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)

      const icp = await IcpService.create(userId, {
         name: 'Growth leaders',
         includeTitles: ['growth'],
         excludeTitles: ['student'],
         seniorities: ['VP'],
         industries: [],
         companySizes: [],
         locations: ['london'],
         problemKeywords: ['pipeline'],
      })

      await LinkedInPostService.addMany(userId, [
         {
            slug: 'activity-7452924970042826753',
            url: POST,
         },
      ])

      const workflow = await WorkflowService.create(userId, {
         name: `Engine ${randomUUID().slice(0, 8)}`,
         goal: null,
         graph: flagshipGraph({
            icpId: icp.id,
            posts: 5,
            perPost: 10,
         }),
      })

      const { id, outputListId: listId } = workflow

      workflowId = id
      outputListId = listId
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should run a preview without adding anyone or touching the posts', async () => {
      const client = fakeClient()
      const run = await WorkflowService.startRun(userId, workflowId, 'PREVIEW', `preview-${randomUUID()}`)

      await advanceRun(run?.id ?? '', deps(client))

      const done = await WorkflowService.run(userId, run?.id ?? '')

      expect(done).toMatchObject({
         status: 'SUCCEEDED',
         qualified: 1,
         maybe: 1,
         discarded: 1,
      })
      await expect(PrismaService.client.workflowListMember.count({ where: { listId: outputListId } })).resolves.toBe(0)
      await expect(LinkedInPostService.countWaiting(userId)).resolves.toBe(1)
   })

   it('should run the flagship flow, book the cost once and mark the post done last', async () => {
      const client = fakeClient()
      const run = await WorkflowService.startRun(userId, workflowId, 'MANUAL', `manual-${randomUUID()}`)

      await expect(WorkflowService.startRun(userId, workflowId, 'MANUAL', `again-${randomUUID()}`)).rejects.toThrow(
         'still going'
      )

      await advanceRun(run?.id ?? '', deps(client))
      await advanceRun(run?.id ?? '', deps(client))

      const done = await WorkflowService.run(userId, run?.id ?? '')
      const members = await PrismaService.client.workflowListMember.findMany({
         where: { listId: outputListId },
         orderBy: { slug: 'asc' },
      })
      const ledger = await PrismaService.client.spendLedger.aggregate({
         where: { runId: run?.id },
         _sum: { amountMicros: true },
      })

      expect(done?.status).toBe('SUCCEEDED')
      expect(members.map(({ slug, state }) => [slug, state])).toEqual([
         ['ada-growth', 'QUALIFIED'],
         ['cy-growth', 'MAYBE'],
      ])
      expect(ledger._sum.amountMicros).toBe(2 * 2_000 + 2 * 2_000 + 4_000)
      expect(done?.costMicros).toBe(ledger._sum.amountMicros)
      expect(client.collect).toHaveBeenCalledTimes(3)
      await expect(LinkedInPostService.countWaiting(userId)).resolves.toBe(0)
   })
})
