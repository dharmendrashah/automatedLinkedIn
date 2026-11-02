import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Graph, inputPickOf } from '@automatedLinkedIn/contracts'

import { InputPickService } from './inputPick.service'
import { InputTakenService } from './inputTaken.service'
import { LinkedInCompanyService } from './linkedInCompany.service'
import { PrismaService } from './prisma.service'
import { UserService } from './user.service'
import { WorkflowService } from './workflow.service'

// Needs PostgreSQL. "Skip what this workflow already took": each run takes the next batch.

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

let userId: string
let workflowId: string

const nextBatch = async (config: Record<string, unknown>, runId: string | null) => {
   const filter = await InputPickService.filter(
      userId,
      inputPickOf('input.companies', config),
      workflowId,
      'input.companies',
      new Date(),
      runId
   )

   return (await LinkedInCompanyService.pick(userId, 2, filter)).map(({ slug }) => slug)
}

describe('skip what the workflow already took (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      workflowId = (
         await WorkflowService.create(userId, {
            name: `Taken ${randomUUID().slice(0, 8)}`,
            goal: null,
            graph,
         })
      ).id

      await LinkedInCompanyService.addMany(
         userId,
         ['a', 'b', 'c', 'd', 'e'].map(slug => ({
            slug,
            url: `https://www.linkedin.com/company/${slug}`,
         }))
      )
      await PrismaService.client.linkedInCompany.updateMany({
         where: { userId },
         data: { createdAt: new Date('2026-10-01T00:00:00Z') },
      })
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should take the same batch every time while the setting is off', async () => {
      const first = await nextBatch({ order: 'oldest' }, 'run-1')

      await InputTakenService.record(workflowId, 'run-1', 'COMPANY', first)

      expect(await nextBatch({ order: 'oldest' }, 'run-2')).toEqual(first)
   })

   it('should take the next batch once earlier runs took the first, and the same batch again on a retry of its own run', async () => {
      const config = {
         order: 'oldest',
         skipTaken: true,
      }
      const first = await nextBatch(config, 'run-3')

      await InputTakenService.record(workflowId, 'run-3', 'COMPANY', first)

      const second = await nextBatch(config, 'run-4')

      expect(second.some(slug => first.includes(slug))).toBe(false)
      expect(await nextBatch(config, 'run-3')).toEqual(first)
   })

   it('should forget what was taken more than 180 days ago, and take nothing twice', async () => {
      await PrismaService.client.workflowInputTaken.updateMany({
         where: { workflowId },
         data: { createdAt: new Date(Date.now() - 181 * 24 * 60 * 60 * 1000) },
      })
      await InputTakenService.record(workflowId, 'run-5', 'COMPANY', ['a', 'a'])

      expect(await InputTakenService.slugs(workflowId, 'COMPANY', null)).toEqual(['a'])
   })
})
