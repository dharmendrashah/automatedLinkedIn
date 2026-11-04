import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { PersonSnapshotService, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The reading blocks through the real engine; no model is called (none is set up in the tests) and nothing is asked of
// the spider or the data service.

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
      name: `Read ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const runId = (await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `read-${randomUUID()}`))?.id ?? ''

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

const read = (title: string, start: string | null) => ({
   name: null,
   headline: null,
   location: 'Pune, India',
   country: 'India',
   about: null,
   photo: null,
   followers: null,
   connections: null,
   openToWork: false,
   hiring: false,
   experience: [
      {
         title,
         company: 'Acme',
         companyUrl: null,
         location: null,
         start,
         end: null,
         description: null,
      },
   ],
   education: [],
   skills: ['SEO'],
})

describe('Detect changes, Find the pattern and Label with AI (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should keep the person whose stored read shows a new role, write one signal for it, and say why the rest went to Else', async () => {
      const started = new Date(Date.now() - 20 * 86_400_000)
      const recent = `${started.getUTCMonth() + 1}/${started.getUTCFullYear()}`

      await PersonSnapshotService.save(userId, 'ada', read('Head of Growth', recent))
      await PersonSnapshotService.save(userId, 'bob', read('Founder', '2019'))

      const runId = await run({
         nodes: [
            node('people', 'input.profiles', { links: [profile('ada'), profile('bob'), profile('cy')] }),
            node('changes', 'collect.changes', { withinDays: 90 }),
            node('else', 'logic.else'),
         ],
         edges: [line('people', 'changes'), line('changes', 'else')],
      })

      const [ada] = await itemsAt(runId, 'changes')

      expect(ada).toMatchObject({
         slug: 'ada',
         facts: {
            'change.kind': 'new_role',
            'change.role': 'Head of Growth',
         },
      })
      expect((await itemsAt(runId, 'else')).map(({ slug, result }) => [slug, result?.reason])).toEqual([
         ['bob', 'No change.'],
         ['cy', 'Never read.'],
      ])
      expect(await stepMessage(runId, 'changes')).toBe('3 in, 1 with a new role, 1 no change, 1 never read.')

      const signals = await PrismaService.client.personSignal.findMany({ where: { userId } })

      expect(signals.map(({ slug, type }) => [slug, type])).toEqual([['ada', 'jobchange']])
   })

   it('should sum up stored profiles and pass the people on unchanged', async () => {
      const slugs = ['p1', 'p2', 'p3', 'p4', 'p5']

      for (const slug of slugs) {
         await PersonSnapshotService.save(userId, slug, read('Head of Growth', null))
      }

      const runId = await run({
         nodes: [
            node('people', 'input.profiles', { links: slugs.map(profile) }),
            node('pattern', 'process.pattern', { parts: ['titles'] }),
         ],
         edges: [line('people', 'pattern')],
      })

      expect(await itemsAt(runId, 'pattern')).toHaveLength(5)
      expect(await stepMessage(runId, 'pattern')).toBe('5 people, 5 with a full profile. Titles: Head of Growth 100%.')
   })

   it('should send everything to Else with a plain reason when no AI is set up, and book no cost', async () => {
      const runId = await run({
         nodes: [
            node('people', 'input.profiles', { links: [profile('ada')] }),
            node('label', 'process.classify', {
               labels: ['asking: Asks for a tool', 'complaint: Complains'],
               read: 'headline',
            }),
            node('else', 'logic.else'),
         ],
         edges: [line('people', 'label'), line('label', 'else')],
      })

      // A person from a link has no headline, so there is nothing to read; with one, the reason would be "AI is not set up."
      expect((await itemsAt(runId, 'else')).map(({ result }) => result?.reason)).toEqual(['Nothing to read.'])
      expect(await itemsAt(runId, 'label')).toHaveLength(0)
      expect(
         await PrismaService.client.spendLedger.count({
            where: {
               userId,
               label: { startsWith: 'AI ' },
            },
         })
      ).toBe(0)
   })
})
