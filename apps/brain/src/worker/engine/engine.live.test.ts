import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { DataClient } from 'core/dataClient'

import { MINDCASE_API_KEY } from 'env'

import { IcpService, LinkedInPostService, PrismaService, UserService, WorkflowService } from 'database'

import { flagshipGraph } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Opt-in, spends real money (a few cents): WORKFLOW_LIVE_TEST=1 with MINDCASE_API_KEY and PostgreSQL. Not picked up
// by the unit or integration runners.

const email = `${randomUUID()}@elitale.com`
const POST = 'https://www.linkedin.com/feed/update/urn:li:activity:7452924970042826753'

describe.skipIf(!process.env.WORKFLOW_LIVE_TEST)('workflow engine (live data service)', () => {
   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should run the flagship flow on a real post and book what it really cost', async () => {
      const userId = (await UserService.create({ email })).id
      const icp = await IcpService.create(userId, {
         name: 'Live test',
         includeTitles: ['ai', 'engineer', 'developer', 'founder', 'manager', 'director', 'consultant'],
         excludeTitles: ['student'],
         seniorities: ['OWNER', 'CXO', 'VP', 'HEAD', 'DIRECTOR', 'MANAGER'],
         industries: [],
         companySizes: [],
         locations: [],
         problemKeywords: ['agent', 'ai'],
      })

      await LinkedInPostService.addMany(userId, [
         {
            slug: 'activity-7452924970042826753',
            url: POST,
         },
      ])

      const workflow = await WorkflowService.create(userId, {
         name: 'Live flagship',
         goal: null,
         graph: flagshipGraph({
            icpId: icp.id,
            posts: 1,
            perPost: 5,
         }),
      })
      const run = await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `live-${randomUUID()}`)
      const client = new DataClient({
         key: MINDCASE_API_KEY,
         requestsPerMinute: 45,
      })

      for (let round = 0; round < 20; round += 1) {
         await advanceRun(run?.id ?? '', {
            client,
            signal: new AbortController().signal,
            log: console,
         })
      }

      const done = await WorkflowService.run(userId, run?.id ?? '')
      const ledger = await PrismaService.client.spendLedger.aggregate({
         where: { runId: run?.id },
         _sum: { amountMicros: true },
      })
      const members = await PrismaService.client.workflowListMember.count({ where: { listId: workflow.outputListId } })

      console.log(
         JSON.stringify(
            {
               status: done?.status,
               message: done?.message,
               estimateMicros: done?.estimateMicros,
               costMicros: done?.costMicros,
               qualified: done?.qualified,
               maybe: done?.maybe,
               discarded: done?.discarded,
               members,
               steps: done?.steps,
            },
            null,
            1
         )
      )

      expect(done?.status).toMatch(/SUCCEEDED|PARTIAL/)
      expect(done?.costMicros).toBeGreaterThan(0)
      expect(done?.costMicros).toBe(ledger._sum.amountMicros)
      expect(done?.costMicros).toBeLessThanOrEqual(done?.estimateMicros ?? 0)
   }, 600_000)
})
