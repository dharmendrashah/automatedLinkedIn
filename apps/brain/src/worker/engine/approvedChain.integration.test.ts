import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { DraftService, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. A run started by an approval works on the approved drafts, rebuilt by id with their final words, and the comment
// block plans them (Act for real off: it says what it would do and queues nothing). The data service is a fake and never asked.

const email = `${randomUUID()}@elitale.com`
const POST = 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216800001'

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

const graph: Graph = {
   nodes: [
      {
         id: 'approved',
         type: 'trigger.approved',
         config: {},
         position: {
            x: 0,
            y: 0,
         },
      },
      {
         id: 'comment',
         type: 'account.commentOnPost',
         config: { words: '{written} Thanks, {author_first_name}.' },
         position: {
            x: 240,
            y: 0,
         },
      },
   ],
   edges: [
      {
         from: 'approved',
         to: 'comment',
      },
   ],
}

let userId: string
let workflowId: string

describe('a run started by an approval (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
      workflowId = (
         await WorkflowService.create(userId, {
            name: `Approvals ${randomUUID().slice(0, 8)}`,
            goal: null,
            graph,
         })
      ).id
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should take the approved drafts with their final words and plan the comment for the account that invited the author', async () => {
      const db = PrismaService.client
      const account = await db.linkedInAccount.create({
         data: {
            userId,
            email: `${randomUUID()}@example.com`,
            secret: 'x',
            secretIv: 'x',
            secretTag: 'x',
            status: 'ACTIVE',
         },
      })

      await db.linkedInInvite.create({
         data: {
            userId,
            accountId: account.id,
            slug: 'ada-lovelace',
            name: 'Ada Lovelace',
            state: 'SENT',
            plannedAt: new Date(),
            invitedAt: new Date(),
         },
      })
      await DraftService.queue(
         userId,
         {
            workflowId,
            runId: 'earlier',
            nodeId: 'ask',
         },
         {
            perDay: 10,
            keepWaiting: 10,
            expireHours: 48,
         },
         'COMMENT',
         [
            {
               slug: 'ada-lovelace',
               targetKey: 'activity:7520195721216800001',
               item: {
                  kind: 'post',
                  slug: '7520195721216800001',
                  url: POST,
                  postId: null,
                  author: 'https://www.linkedin.com/in/ada-lovelace',
               },
               card: {
                  postUrl: POST,
                  excerpt: null,
                  authorName: 'Ada Lovelace',
                  authorHeadline: null,
               },
               words: 'Which step went first?',
               mode: 'AI',
               maxChars: 240,
            },
         ]
      )

      const draft = await db.draft.findFirstOrThrow({ where: { userId } })

      await DraftService.approve(userId, [
         {
            id: draft.id,
            words: 'Which step did you drop first?',
         },
      ])

      const input = { drafts: [draft.id] }
      const key = `${workflowId}:approval:test`
      const run = await WorkflowService.startRun(userId, workflowId, 'APPROVAL', key, { input })

      await advanceRun(run?.id ?? '', deps())

      const steps = await db.workflowStepRun.findMany({
         where: { runId: run?.id },
         orderBy: { nodeId: 'asc' },
      })
      const items = await db.workflowItem.findMany({ where: { runId: run?.id } })

      expect(steps.map(({ nodeId, status }) => [nodeId, status])).toEqual([
         ['approved', 'DONE'],
         ['comment', 'DONE'],
      ])
      expect(steps.find(({ nodeId }) => nodeId === 'approved')?.itemsOut).toBe(1)
      expect(steps.find(({ nodeId }) => nodeId === 'comment')?.message).toContain('1 in, 1 would be planned')
      expect(JSON.stringify(items)).toContain('Which step did you drop first?')
      expect(await db.postAct.count({ where: { userId } })).toBe(0)
   })
})
