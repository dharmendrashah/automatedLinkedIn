import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Graph } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { WorkflowService } from './workflow.service'

// Needs PostgreSQL. A failed run is shown to its owner until dismissed (.plan/workflow-engine-p4-lifecycle.md).

const email = `${randomUUID()}@elitale.com`
const otherEmail = `${randomUUID()}@elitale.com`

const graph: Graph = {
   nodes: [
      {
         id: 'start',
         type: 'trigger.manual',
         config: {},
         position: {
            x: 0,
            y: 0,
         },
      },
   ],
   edges: [],
}

let userId: string
let otherId: string

// A run of the user's own new workflow, ended with the status.
const ended = async (
   owner: string,
   status: 'FAILED' | 'SUCCEEDED' | 'PARTIAL',
   change: { trigger?: 'MANUAL' | 'PREVIEW'; finishedDaysAgo?: number } = {}
) => {
   const workflow = await WorkflowService.create(owner, {
      name: `Alert ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const run = await WorkflowService.startRun(owner, workflow.id, change.trigger ?? 'MANUAL', `alert-${randomUUID()}`)

   await PrismaService.client.workflowRun.update({
      where: { id: run?.id },
      data: {
         status,
         message: 'Nobody passed the filter.',
         finishedAt: new Date(Date.now() - (change.finishedDaysAgo ?? 0) * 86_400_000),
      },
   })

   return {
      runId: run?.id ?? '',
      name: workflow.name,
   }
}

describe('failure alerts (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      otherId = (await UserService.create({ email: otherEmail })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email: { in: [email, otherEmail] } } })
      await PrismaService.disconnect()
   })

   it('should list the owner failed runs, newest first, with the workflow name and the message', async () => {
      const older = await ended(userId, 'FAILED', { finishedDaysAgo: 1 })
      const newer = await ended(userId, 'FAILED')

      await ended(userId, 'SUCCEEDED')
      await ended(userId, 'PARTIAL')
      await ended(otherId, 'FAILED')

      const alerts = await WorkflowService.alerts(userId)

      expect(alerts.map(({ runId }) => runId)).toEqual([newer.runId, older.runId])
      expect(alerts[0]).toMatchObject({
         workflowName: newer.name,
         message: 'Nobody passed the filter.',
      })
   })

   it('should leave out a preview, a run older than a week, and a dismissed run', async () => {
      const preview = await ended(userId, 'FAILED', { trigger: 'PREVIEW' })
      const old = await ended(userId, 'FAILED', { finishedDaysAgo: 8 })
      const dismissed = await ended(userId, 'FAILED')

      expect(await WorkflowService.dismissAlert(userId, dismissed.runId)).toBe(true)

      const ids = (await WorkflowService.alerts(userId)).map(({ runId }) => runId)

      expect(ids).not.toContain(preview.runId)
      expect(ids).not.toContain(old.runId)
      expect(ids).not.toContain(dismissed.runId)
   })

   it('should not let one owner dismiss the alert of another', async () => {
      const theirs = await ended(otherId, 'FAILED')

      expect(await WorkflowService.dismissAlert(userId, theirs.runId)).toBe(false)
      expect((await WorkflowService.alerts(otherId)).map(({ runId }) => runId)).toContain(theirs.runId)
   })
})
