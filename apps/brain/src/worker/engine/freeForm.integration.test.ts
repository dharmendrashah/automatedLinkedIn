import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { IcpService, LinkedInPostService, PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { GOALS, type Graph, type GraphNode, TEMPLATE_NUMBERS, templateGraph } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service and the owner's API address are fakes: no money is spent, nothing is sent.

const email = `${randomUUID()}@elitale.com`
const profile = (slug: string) => `https://www.linkedin.com/in/${slug}`
const post = (id: number) =>
   `https://www.linkedin.com/posts/someone_topic-activity-74529249700428${String(id).padStart(5, '0')}-AbCd`

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

// Posts of a person are written by the next person: ada -> bob -> cy -> dee.
const NEXT: Record<string, string> = {
   ada: 'bob',
   bob: 'cy',
   cy: 'dee',
}

const fakeClient = () => ({
   balanceMicros: vi.fn(async () => 50_000_000),
   findJob: vi.fn(async () => null),
   collect: vi.fn(
      async (slug: string, params: Record<string, unknown>, known: { onJobId: (id: string) => Promise<void> }) => {
         await known.onJobId(`job-${slug}`)

         const author = String(params.urls ?? '').split('/in/')[1] ?? ''
         const rows: Record<string, unknown>[] =
            slug === 'post-comments'
               ? [
                    {
                       commenterUrl: profile('ada'),
                       commenterFollowers: 900,
                       commenterType: 'profile',
                    },
                    {
                       commenterUrl: profile('bob'),
                       commenterFollowers: 10,
                       commenterType: 'profile',
                    },
                 ]
               : slug === 'posts' && params.queries
                 ? [
                      {
                         postUrl: post(1),
                         postAuthorUrl: profile('zed'),
                      },
                   ]
                 : slug === 'profiles' && params.searchQuery
                   ? [{ profileUrl: profile('bob') }, { profileUrl: profile('dee') }]
                   : slug === 'posts'
                     ? [
                          {
                             postUrl: post(Object.keys(NEXT).indexOf(author) + 10),
                             postAuthorUrl: profile(NEXT[author] ?? 'end'),
                          },
                       ]
                     : []

         return {
            jobId: `job-${slug}`,
            status: 'completed' as const,
            rows,
            costMicros: rows.length * 2_000,
            error: null,
         }
      }
   ),
})

const sent: { url: string; body: string; headers: Record<string, string> }[] = []

const deps = (client: ReturnType<typeof fakeClient>) => ({
   client,
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
   post: async (url: string, body: string, headers: Record<string, string>) => {
      sent.push({
         url,
         body,
         headers,
      })

      return { status: 200 }
   },
})

let userId: string

const saved = async (graph: Graph) =>
   WorkflowService.create(userId, {
      name: `Free ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })

const childrenOf = (runId: string) =>
   PrismaService.client.workflowRun.findMany({
      where: { parentRunId: runId },
      select: {
         id: true,
         depth: true,
         status: true,
      },
   })

// Moves the run forward, and the runs its "Run another workflow" blocks started.
const runOf = async (graph: Graph) => {
   const workflow = await saved(graph)
   const run = await WorkflowService.startRun(userId, workflow.id, 'MANUAL', `free-${randomUUID()}`)
   const client = fakeClient()

   for (let round = 0; round < 5; round += 1) {
      await advanceRun(run?.id ?? '', deps(client))

      for (const child of await childrenOf(run?.id ?? '')) {
         await advanceRun(child.id, deps(client))
      }
   }

   return {
      workflow,
      runId: run?.id ?? '',
      client,
   }
}

const itemsAt = (runId: string, nodeId: string) =>
   PrismaService.client.workflowItem.findMany({
      where: {
         runId,
         nodeId,
      },
      orderBy: [{ round: 'asc' }, { slug: 'asc' }],
   })

describe('free-form workflows (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should run without trigger or scoring, split on If and Else, label, list unscored and keep a CSV', async () => {
      const { workflow, runId } = await runOf({
         nodes: [
            node('find', 'collect.findPosts', {
               keywords: 'pipeline',
               howMany: 1,
            }),
            node('commenters', 'collect.commenters', { howMany: 10 }),
            node('if', 'logic.if', { minFollowers: 500 }),
            node('label', 'process.tag', { tags: ['hot'] }),
            node('list', 'output.list'),
            node('else', 'logic.else'),
            node('csv', 'output.csv'),
         ],
         edges: [
            line('find', 'commenters'),
            line('commenters', 'if'),
            line('if', 'label'),
            line('label', 'list'),
            line('if', 'else'),
            line('else', 'csv'),
            // Posts into a block that wants people: their authors.
            line('find', 'csv'),
         ],
      })
      const run = await WorkflowService.run(userId, runId)
      const members = await PrismaService.client.workflowListMember.findMany({
         where: { listId: workflow.outputListId },
         select: {
            slug: true,
            state: true,
            tags: true,
         },
      })
      const csv = await itemsAt(runId, 'csv')

      expect(run?.status).toBe('SUCCEEDED')
      expect(members).toEqual([
         {
            slug: 'ada',
            state: 'UNSCORED',
            tags: ['hot'],
         },
      ])
      expect(csv.map(({ slug }) => slug)).toEqual(['bob', 'zed'])
      expect(csv.every(({ keepUntil }) => keepUntil !== null)).toBe(true)
   })

   it('should run For each once per batch and a loop until its rounds run out', async () => {
      const batches = await runOf({
         nodes: [
            node('people', 'input.profiles', { links: [profile('ada'), profile('bob'), profile('cy')] }),
            node('each', 'logic.forEach', { batchSize: 2 }),
            node('csv', 'output.csv'),
         ],
         edges: [line('people', 'each'), line('each', 'csv')],
      })
      const loop = await runOf({
         loopRounds: 2,
         nodes: [
            node('people', 'input.profiles', { links: [profile('ada')] }),
            node('posts', 'collect.postsOfPeople', { howMany: 1 }),
            node('csv', 'output.csv'),
         ],
         edges: [line('people', 'posts'), line('posts', 'csv'), line('csv', 'posts')],
      })

      expect((await itemsAt(batches.runId, 'csv')).map(({ round, slug }) => [round, slug])).toEqual([
         [0, 'ada'],
         [0, 'bob'],
         [1, 'cy'],
      ])
      expect((await itemsAt(loop.runId, 'csv')).map(({ round, slug }) => [round, slug])).toEqual([
         [0, 'bob'],
         [1, 'cy'],
      ])
      expect((await WorkflowService.run(userId, loop.runId))?.status).toBe('SUCCEEDED')
   })

   it('should run every ready-made template to the end once its inputs are set', async () => {
      const icp = await IcpService.create(userId, {
         name: 'Template check',
         includeTitles: ['growth'],
         excludeTitles: [],
         seniorities: [],
         industries: [],
         companySizes: [],
         locations: [],
         problemKeywords: [],
      })
      const withAddress = (graph: Graph): Graph => ({
         ...graph,
         nodes: graph.nodes.map(item =>
            item.type === 'output.sendApi'
               ? {
                    ...item,
                    config: { url: 'https://example.com/hook' },
                 }
               : item
         ),
      })
      const statuses: [string, string | undefined][] = []

      for (const [index, goal] of GOALS.entries()) {
         // Templates that mark posts done use them up, so each run gets a fresh one.
         await LinkedInPostService.addMany(userId, [
            {
               slug: `activity-74529249700428${String(500 + index).padStart(5, '0')}`,
               url: post(500 + index),
            },
         ])

         const { runId } = await runOf(
            withAddress(
               templateGraph(goal, {
                  ...TEMPLATE_NUMBERS,
                  icpId: icp.id,
                  keywords: 'pipeline',
                  customer: profile('ada'),
                  jobTitle: 'SDR',
                  domains: ['stripe.com'],
               })
            )
         )

         statuses.push([goal, (await WorkflowService.run(userId, runId))?.status])
      }

      expect(statuses).toEqual(GOALS.map(goal => [goal, 'SUCCEEDED']))
   })

   it('should run another workflow: go on at once, answer yes or no, or bring back the people it saved', async () => {
      const listing = await saved({
         nodes: [
            node('people', 'input.profiles', { links: [profile('ada'), profile('bob')] }),
            node('list', 'output.list'),
         ],
         edges: [line('people', 'list')],
      })
      const broken = await saved({
         nodes: [node('people', 'input.profiles'), node('score', 'score.icp', { icpId: 'not-mine' })],
         edges: [line('people', 'score')],
      })
      const caller = (workflowId: string, config: Record<string, string>) => ({
         nodes: [
            node('people', 'input.profiles', { links: [profile('cy')] }),
            node('call', 'logic.runWorkflow', {
               workflowId,
               ...config,
            }),
            node('csv', 'output.csv'),
            node('else', 'logic.else'),
            node('no', 'output.csv'),
         ],
         edges: [line('people', 'call'), line('call', 'csv'), line('call', 'else'), line('else', 'no')],
      })
      const slugsAt = async (runId: string, nodeId: string) => (await itemsAt(runId, nodeId)).map(({ slug }) => slug)

      // Sending what reached it: the other workflow reads cy instead of its own links.
      const sent = await runOf(caller(listing.id, { wait: 'results' }))
      const own = await runOf(
         caller(listing.id, {
            wait: 'results',
            send: 'nothing',
         })
      )
      const yes = await runOf(caller(listing.id, { wait: 'status' }))
      const no = await runOf(caller(broken.id, { wait: 'status' }))
      const none = await runOf(caller(listing.id, { wait: 'none' }))

      expect(await slugsAt(sent.runId, 'csv')).toEqual(['cy'])
      expect(await childrenOf(sent.runId)).toEqual([
         expect.objectContaining({
            depth: 1,
            status: 'SUCCEEDED',
         }),
      ])
      expect(await slugsAt(own.runId, 'csv')).toEqual(['ada', 'bob'])
      expect([await slugsAt(yes.runId, 'csv'), await slugsAt(yes.runId, 'no')]).toEqual([['cy'], []])
      expect([await slugsAt(no.runId, 'csv'), await slugsAt(no.runId, 'no')]).toEqual([[], ['cy']])
      expect(await slugsAt(none.runId, 'csv')).toEqual(['cy'])

      for (const { runId } of [sent, own, yes, no, none]) {
         expect((await WorkflowService.run(userId, runId))?.status).toBe('SUCCEEDED')
      }
   })

   it('should refuse workflows that would run each other in a loop', async () => {
      const first = await saved({
         nodes: [node('trigger', 'trigger.manual')],
         edges: [],
      })
      const second = await saved({
         nodes: [node('call', 'logic.runWorkflow', { workflowId: first.id })],
         edges: [],
      })
      const problems = await WorkflowService.problems(
         userId,
         {
            nodes: [node('call', 'logic.runWorkflow', { workflowId: second.id })],
            edges: [],
         },
         first.id
      )

      expect(problems.map(({ message }) => message)).toContain(
         'These workflows would run each other in a loop. Pick another workflow.'
      )
   })

   it('should send what reaches Send via API to the owner address with the secret header', async () => {
      sent.length = 0

      await runOf({
         nodes: [
            node('people', 'input.profiles', { links: [profile('ada')] }),
            node('send', 'output.sendApi', {
               url: 'https://example.com/hook',
               secret: 'shh',
            }),
         ],
         edges: [line('people', 'send')],
      })

      expect(sent).toHaveLength(1)
      expect(sent[0].headers).toEqual({ 'x-workflow-secret': 'shh' })
      expect(JSON.parse(sent[0].body)).toMatchObject({
         page: 1,
         pages: 1,
         items: [expect.objectContaining({ slug: 'ada' })],
      })
   })

   it('should merge a picked line and a search: everything once, only shared, or only the main line', async () => {
      const merged = async (mode: string) => {
         const { runId } = await runOf({
            nodes: [
               node('picked', 'input.profiles', { links: [profile('ada'), profile('bob')] }),
               node('search', 'collect.searchPeople', { keywords: 'sales' }),
               node('merge', 'process.merge', {
                  mode,
                  main: 'picked',
               }),
               node('csv', 'output.csv'),
            ],
            edges: [line('picked', 'merge'), line('search', 'merge'), line('merge', 'csv')],
         })

         return (await itemsAt(runId, 'csv')).map(({ slug }) => slug)
      }

      expect(await merged('all')).toEqual(['ada', 'bob', 'dee'])
      expect(await merged('every')).toEqual(['bob'])
      expect(await merged('onlyMain')).toEqual(['ada'])
   })

   it('should send "All" as the safety cap and leave out settings that mean any', async () => {
      const { client } = await runOf({
         nodes: [
            node('find', 'collect.findPosts', {
               keywords: 'pipeline',
               howMany: 1,
               sortBy: 'date',
            }),
            node('commenters', 'collect.commenters', {
               all: true,
               postedWithin: 'week',
            }),
         ],
         edges: [line('find', 'commenters')],
      })
      const params = (slug: string) => client.collect.mock.calls.find(([called]) => called === slug)?.[1]

      expect(params('posts')).toEqual({
         queries: 'pipeline',
         postedLimit: 'month',
         maxResults: 1,
         sortBy: 'date',
      })
      expect(params('post-comments')).toEqual({
         posts: post(1),
         maxResults: 1_000,
         postedLimit: 'week',
      })
   })
})
