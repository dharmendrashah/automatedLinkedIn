import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Graph } from '@automatedLinkedIn/contracts'

import { ApprovalStartService } from './approvalStart.service'
import { DraftService } from './draft.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { WorkflowService } from './workflow.service'

// Needs PostgreSQL. An approval starts the workflow's "When I approve" once, and only when the workflow is on and has the block.

const db = PrismaService.client
const email = `${randomUUID()}@elitale.com`
const MINUTE_MS = 60 * 1000
const limits = {
   perDay: 50,
   keepWaiting: 50,
   expireHours: 48,
}

const graph = (groupMinutes: number): Graph => ({
   nodes: [
      {
         id: 'approved',
         type: 'trigger.approved',
         config: { groupMinutes },
         position: {
            x: 0,
            y: 0,
         },
      },
      {
         id: 'comment',
         type: 'account.commentOnPost',
         config: {},
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
})

let userId: string

const workflow = async (groupMinutes: number, enabled = true) => {
   const made = await WorkflowService.create(userId, {
      name: `Approvals ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph: graph(groupMinutes),
   })

   if (enabled) {
      await WorkflowService.update(userId, made.id, { enabled: true })
   }

   return made.id
}

// A draft from that workflow, approved.
const approved = async (workflowId: string, key: number) => {
   const targetKey = `activity:${randomUUID()}-${key}`

   await DraftService.queue(
      userId,
      {
         workflowId,
         runId: 'r1',
         nodeId: 'ask',
      },
      limits,
      'COMMENT',
      [
         {
            slug: `ada-${key}`,
            targetKey,
            item: {
               kind: 'post',
               slug: `${key}`,
               url: 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216800001',
               postId: null,
            },
            card: {
               postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216800001',
               excerpt: null,
               authorName: null,
               authorHeadline: null,
            },
            words: 'Which step went first?',
            mode: 'AI',
            maxChars: 240,
         },
      ]
   )

   const row = await db.draft.findFirstOrThrow({
      where: {
         userId,
         targetKey,
      },
   })

   await DraftService.approve(userId, [{ id: row.id }])

   return row.id
}

const runsOf = (workflowId: string) =>
   db.workflowRun.findMany({
      where: {
         workflowId,
         trigger: 'APPROVAL',
      },
   })

describe('approval start (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await db.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should start one run for the approvals of a workflow, with the drafts as its input, and never start them again', async () => {
      const id = await workflow(0)
      const first = await approved(id, 1)
      const second = await approved(id, 2)

      await ApprovalStartService.startDue()

      const [run, ...rest] = await runsOf(id)

      expect(rest).toEqual([])
      expect(run?.input).toEqual({ drafts: expect.arrayContaining([first, second]) })
      expect((await db.draft.findUniqueOrThrow({ where: { id: first } })).startedRunId).toBe(run?.id)

      await ApprovalStartService.startDue()

      expect(await runsOf(id)).toHaveLength(1)
   })

   it('should start one run when two passes run at once', async () => {
      const id = await workflow(0)

      await approved(id, 3)
      await Promise.all([ApprovalStartService.startDue(), ApprovalStartService.startDue()])

      expect(await runsOf(id)).toHaveLength(1)
   })

   it('should wait for the group window, then start', async () => {
      const id = await workflow(5)
      const draft = await approved(id, 4)

      expect(await ApprovalStartService.startDue()).toMatchObject({ grouping: expect.any(Number) })
      expect(await runsOf(id)).toHaveLength(0)

      await ApprovalStartService.startDue(new Date(Date.now() + 6 * MINUTE_MS))

      expect(await runsOf(id)).toHaveLength(1)
      expect((await db.draft.findUniqueOrThrow({ where: { id: draft } })).startedRunId).not.toBeNull()
   })

   it('should keep the approval of a workflow that is off, and start it when it is on', async () => {
      const id = await workflow(0, false)
      const draft = await approved(id, 5)

      await ApprovalStartService.startDue()

      expect(await runsOf(id)).toHaveLength(0)
      expect((await db.draft.findUniqueOrThrow({ where: { id: draft } })).startedRunId).toBeNull()

      await WorkflowService.update(userId, id, { enabled: true })
      await ApprovalStartService.startDue()

      expect(await runsOf(id)).toHaveLength(1)
   })

   it('should leave an approval alone when no workflow has the block', async () => {
      const draft = await approved('no-such-workflow', 6)

      await ApprovalStartService.startDue()

      expect((await db.draft.findUniqueOrThrow({ where: { id: draft } })).startedRunId).toBeNull()
   })
})
