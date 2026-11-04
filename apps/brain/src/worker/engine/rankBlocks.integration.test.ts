import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { IcpService, PrismaService, SignalService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The ranking blocks through the real engine; nothing is asked of the spider or the data service.

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

const run = async (graph: Graph) => {
   const workflow = await WorkflowService.create(userId, {
      name: `Rank ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const runId = (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `rank-${randomUUID()}`))?.id ?? ''

   await advanceRun(runId, deps())

   return runId
}

type Data = {
   slug: string
   score?: number
   tier?: string
   tags?: string[]
   result?: { status: string; reason: string }
}

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

describe('Score by signals, Add label and Stop contacting them (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should rank people from their stored signals, label the tier, and stop the ones the workflow sends to Else', async () => {
      const icp = await IcpService.create(userId, {
         name: `Growth ${randomUUID().slice(0, 8)}`,
         includeTitles: ['growth'],
         excludeTitles: [],
         seniorities: [],
         industries: [],
         companySizes: [],
         locations: [],
         problemKeywords: [],
      })

      await SignalService.recordPeople(userId, [
         {
            slug: 'ada',
            type: 'asked',
            via: 'post-1',
            at: new Date(),
         },
      ])

      const runId = await run({
         nodes: [
            node('people', 'input.profiles', { links: [profile('ada'), profile('bob')] }),
            node('score', 'score.signals', {
               icpId: icp.id,
               tierA: 30,
               tierB: 15,
               tierC: 5,
               keepTierD: false,
            }),
            node('label', 'process.tag', {
               tags: ['tier-b'],
               replacePrefix: 'tier-',
            }),
            node('else', 'logic.else'),
            node('stop', 'output.doNotContact', { reason: 'Not a fit' }),
         ],
         edges: [line('people', 'score'), line('score', 'label'), line('score', 'else'), line('else', 'stop')],
      })

      const [ada] = await itemsAt(runId, 'label')

      expect(await itemsAt(runId, 'label')).toHaveLength(1)
      expect(ada).toMatchObject({
         slug: 'ada',
         // An asked signal today is 20; no profile read keeps a person below tier A.
         score: 20,
         tier: 'B',
         tags: ['tier-b'],
      })
      expect(await stepMessage(runId, 'score')).toBe('2 in, 0 A, 1 B, 0 C, 0 D, 1 to Else.')

      const [bob] = await itemsAt(runId, 'stop')

      expect(bob).toMatchObject({
         slug: 'bob',
         result: {
            status: 'DONE',
            reason: 'Not a fit',
         },
      })
      expect((await PrismaService.client.suppression.findMany({ where: { userId } })).map(({ slug }) => slug)).toEqual([
         'bob',
      ])
      expect(await stepMessage(runId, 'stop')).toBe('1 in, 1 stopped, 0 already stopped.')
   })
})
