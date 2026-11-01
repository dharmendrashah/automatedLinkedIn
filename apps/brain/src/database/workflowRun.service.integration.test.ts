import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { person } from 'core'

import { type Graph } from '@automatedLinkedIn/contracts'

import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WalletService } from './wallet.service'
import { WorkflowService } from './workflow.service'
import { WorkflowRunService } from './workflowRun.service'

// Needs PostgreSQL. What a step keeps (.plan/workflow-engine-p0-safety.md).

const email = `${randomUUID()}@elitale.com`

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

let runId: string

describe('workflow items (database)', () => {
   beforeAll(async () => {
      const userId = (await UserService.create({ email })).id

      await WalletService.save(50_000_000)

      const workflow = await WorkflowService.create(userId, {
         name: `Items ${randomUUID().slice(0, 8)}`,
         goal: null,
         graph,
      })

      runId = (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `items-${randomUUID()}`))?.id ?? ''
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should keep a person and a company that share a slug, and still merge the same kind of item twice', async () => {
      const at = {
         runId,
         nodeId: 'start',
         round: 0,
      }
      const ada = person({
         slug: 'stripe',
         url: 'https://www.linkedin.com/in/stripe',
         name: 'Stripe Person',
      })
      const company = {
         kind: 'company' as const,
         slug: 'stripe',
         url: 'https://www.linkedin.com/company/stripe',
         name: 'Stripe',
         hiring: [],
      }

      await WorkflowRunService.seedItems(at, [ada, company])
      await WorkflowRunService.seedItems(at, [ada, company])
      await WorkflowRunService.putItems(at, [
         {
            ...company,
            name: 'Stripe Inc',
         },
      ])
      await WorkflowRunService.mergePeople(at, [
         {
            ...ada,
            headline: 'Payments',
         },
      ])

      const items = await WorkflowRunService.items(runId, [at])

      expect(items).toHaveLength(2)
      expect(items).toEqual(
         expect.arrayContaining([
            expect.objectContaining({
               kind: 'company',
               name: 'Stripe Inc',
            }),
            expect.objectContaining({
               kind: 'profile',
               headline: 'Payments',
            }),
         ])
      )
   })
})
