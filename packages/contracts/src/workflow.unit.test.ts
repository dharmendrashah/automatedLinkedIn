import { describe, expect, it } from 'vitest'

import {
   ALL_CAP,
   type BlockType,
   GOALS,
   type Graph,
   type NodeConfig,
   addedSince,
   blockOf,
   catalog,
   errorsOf,
   estimateGraph,
   flagshipGraph,
   inputPickOf,
   inputTake,
   isHandled,
   nextScheduledRun,
   nextScheduledRuns,
   nodeBefore,
   previewGraph,
   retriesOf,
   scheduleOf,
   scheduleSchema,
   templateCatalog,
   templateGraph,
   validateGraph,
   workingBlockBefore,
} from './workflow'

const flagship = flagshipGraph({
   icpId: 'icp-1',
   posts: 10,
   perPost: 100,
})

const without = (graph: Graph, id: string): Graph => ({
   nodes: graph.nodes.filter(node => node.id !== id),
   edges: graph.edges.filter(edge => edge.from !== id && edge.to !== id),
})

describe('input picks', () => {
   it('should read a block saved before the filters as "everything", posts oldest first', () => {
      expect(inputPickOf('input.profiles', { howMany: 25 })).toEqual({
         added: 'any',
         labels: [],
         labelMatch: 'any',
         withoutLabels: [],
         statuses: [],
         order: 'newest',
         timeZone: 'UTC',
      })
      expect(inputPickOf('input.posts', {}).order).toBe('oldest')
      const labelled = blockOf('input.posts').config.safeParse({ labels: ['Fintech '] }).data

      expect(labelled).toMatchObject({ labels: ['fintech'] })
   })

   it('should take All up to the block cap, keep old numbers, and estimate from the live count', () => {
      expect(inputTake('input.profiles', { all: true })).toBe(200)
      expect(inputTake('input.profiles', { howMany: 25 })).toBe(25)
      expect(inputTake('input.companies', {})).toBe(10)

      const graph: Graph = {
         nodes: [
            {
               id: 'people',
               type: 'input.profiles',
               config: { all: true },
               position: {
                  x: 0,
                  y: 0,
               },
            },
         ],
         edges: [],
      }
      const available = {
         posts: 0,
         profiles: 500,
         companies: 0,
      }

      expect(estimateGraph(graph, available).nodes.people.items).toBe(200)
      expect(
         estimateGraph(graph, {
            ...available,
            byNode: { people: 23 },
         }).nodes.people.items
      ).toBe(23)
   })

   it('should start today and this week at local midnight, and Monday, in the block time zone', () => {
      // Wednesday 2026-10-14, 01:30 in Kolkata (20:00 UTC the day before).
      const now = new Date('2026-10-13T20:00:00Z')
      const zone = { timeZone: 'Asia/Kolkata' }

      expect(
         addedSince(
            {
               ...zone,
               added: 'today',
            },
            now,
            null
         )?.toISOString()
      ).toBe('2026-10-13T18:30:00.000Z')
      expect(
         addedSince(
            {
               ...zone,
               added: 'week',
            },
            now,
            null
         )?.toISOString()
      ).toBe('2026-10-11T18:30:00.000Z')
      expect(
         addedSince(
            {
               ...zone,
               added: '7d',
            },
            now,
            null
         )?.toISOString()
      ).toBe('2026-10-06T20:00:00.000Z')
      expect(
         addedSince(
            {
               ...zone,
               added: 'any',
            },
            now,
            null
         )
      ).toBeNull()
      expect(
         addedSince(
            {
               ...zone,
               added: 'lastRun',
            },
            now,
            null
         )
      ).toBeNull()
      expect(
         addedSince(
            {
               ...zone,
               added: 'lastRun',
            },
            now,
            now
         )
      ).toBe(now)
   })
})

describe('workflow catalog', () => {
   it('should give every block defaults that pass its own schema and never name a supplier', () => {
      const blocks = catalog()

      expect(blocks.find(block => block.type === 'collect.commenters')?.defaults).toEqual({
         all: false,
         howMany: 50,
         postedWithin: 'any',
         includeReplies: false,
      })
      expect(JSON.stringify(blocks).toLowerCase()).not.toMatch(/mindcase|apify/)
   })

   it('should only let a preset set its own block settings, to values they accept', () => {
      const required: Partial<Record<BlockType, NodeConfig>> = {
         'collect.findPosts': { keywords: 'pipeline' },
         'collect.jobs': { jobTitle: 'SDR' },
         'score.icp': { icpId: 'icp-1' },
      }

      for (const block of catalog()) {
         const keys = block.fields.flatMap(field => (field.kind === 'limit' ? [field.key, field.allKey] : [field.key]))

         for (const { config } of block.presets) {
            expect(keys).toEqual(expect.arrayContaining(Object.keys(config)))
            expect(
               blockOf(block.type).config.safeParse({
                  ...block.defaults,
                  ...required[block.type],
                  ...config,
               }).success
            ).toBe(true)
         }
      }
   })
})

describe('validateGraph', () => {
   it('should accept the flagship template', () => {
      expect(validateGraph(flagship)).toEqual([])
   })

   it('should let posts reach a block that needs people, using their authors, and only note it', () => {
      const graph: Graph = {
         ...flagship,
         edges: [
            ...flagship.edges,
            {
               from: 'posts',
               to: 'score',
            },
         ],
      }

      expect(validateGraph(graph)).toEqual([
         {
            nodeId: 'score',
            level: 'note',
            message: 'Score against an ideal customer gets posts: it uses their authors.',
         },
      ])
   })

   it('should only note a missing trigger, an orphan, a list without scoring and a loop, never block on them', () => {
      const loop: Graph = {
         ...flagship,
         loopRounds: 4,
         edges: [
            ...flagship.edges,
            {
               from: 'enrich',
               to: 'dedupe',
            },
         ],
      }
      const free: Graph = {
         nodes: without(without(flagship, 'trigger'), 'score').nodes,
         edges: without(without(flagship, 'trigger'), 'score').edges,
      }

      expect(errorsOf(validateGraph(loop))).toEqual([])
      expect(validateGraph(loop)).toContainEqual({
         nodeId: 'dedupe',
         level: 'note',
         message: 'These blocks form a loop; it runs up to 4 rounds.',
      })
      expect(errorsOf(validateGraph(free))).toEqual([])
      expect(validateGraph(free).map(({ message }) => message)).toEqual(
         expect.arrayContaining([
            'No trigger: Run starts from the blocks with nothing before them.',
            'Get full profile has nothing before it, so it gets nothing.',
         ])
      )
   })

   it('should note an Else without an If before it and a workflow that keeps nothing', () => {
      const graph: Graph = {
         nodes: [
            ...without(flagship, 'list').nodes.filter(({ type }) => type !== 'output.markPosts'),
            {
               id: 'else',
               type: 'logic.else',
               config: {},
               position: {
                  x: 0,
                  y: 0,
               },
            },
         ],
         edges: [
            ...without(flagship, 'list').edges.filter(({ to }) => to !== 'done'),
            {
               from: 'enrich',
               to: 'else',
            },
         ],
      }

      expect(validateGraph(graph).map(({ message }) => message)).toEqual([
         'Else passes on nothing unless an If, Task result, Retry or "Run another workflow" comes right before it.',
         'Nothing keeps the results: add "Add to list", "Export to CSV" or "Send via API".',
      ])
   })

   it('should refuse a "how many" of 0, which the data service reads as everything', () => {
      const graph: Graph = {
         ...flagship,
         nodes: flagship.nodes.map(node =>
            node.id === 'commenters'
               ? {
                    ...node,
                    config: { howMany: 0 },
                 }
               : node
         ),
      }

      expect(validateGraph(graph)).toEqual([expect.objectContaining({ nodeId: 'commenters' })])
   })
})

describe('nextScheduledRun', () => {
   const base = scheduleSchema.parse({
      hours: 24,
      at: '09:00',
      weekday: 1,
      timeZone: 'Asia/Kolkata',
   })
   const iso = (schedule: Partial<typeof base>, after: string) =>
      nextScheduledRun(
         {
            ...base,
            ...schedule,
         },
         new Date(after)
      ).toISOString()

   it('should skip the weekend, keep to chosen days and find a day of the month', () => {
      // 2026-10-17 is a Saturday; 09:00 in Kolkata is 03:30 UTC.
      expect(iso({ every: 'weekdays' }, '2026-10-17T02:00:00Z')).toBe('2026-10-19T03:30:00.000Z')
      expect(
         iso(
            {
               every: 'week',
               days: ['1', '4'],
            },
            '2026-10-19T04:00:00Z'
         )
      ).toBe('2026-10-22T03:30:00.000Z')
      expect(
         iso(
            {
               every: 'month',
               dayOfMonth: 5,
            },
            '2026-10-17T02:00:00Z'
         )
      ).toBe('2026-11-05T03:30:00.000Z')
   })

   it('should keep every few hours inside its window and on weekdays', () => {
      const window = {
         every: 'hours' as const,
         hours: 4,
         between: true,
         from: '09:00',
         until: '18:00',
         weekdaysOnly: true,
      }

      expect(iso(window, '2026-10-19T03:30:00Z')).toBe('2026-10-19T07:30:00.000Z')
      // Friday 16:30 plus 4 hours is past 18:00: the next opening is Monday 09:00.
      expect(iso(window, '2026-10-16T11:00:00Z')).toBe('2026-10-19T03:30:00.000Z')
      expect(
         nextScheduledRuns(
            {
               ...base,
               every: 'day',
            },
            new Date('2026-10-17T02:00:00Z'),
            3
         ).map(date => date.toISOString())
      ).toEqual(['2026-10-17T03:30:00.000Z', '2026-10-18T03:30:00.000Z', '2026-10-19T03:30:00.000Z'])
      expect(
         scheduleSchema.safeParse({
            ...window,
            from: '18:00',
            until: '09:00',
         }).success
      ).toBe(false)
   })

   it('should find the next 09:00 in the chosen time zone', () => {
      expect(
         nextScheduledRun(
            {
               ...base,
               every: 'day',
            },
            new Date('2026-10-17T02:00:00Z')
         ).toISOString()
      ).toBe('2026-10-17T03:30:00.000Z')
      expect(
         nextScheduledRun(
            {
               ...base,
               every: 'day',
            },
            new Date('2026-10-17T03:30:00Z')
         ).toISOString()
      ).toBe('2026-10-18T03:30:00.000Z')
   })

   it('should find the next Monday and add hours for an hourly schedule', () => {
      expect(
         nextScheduledRun(
            {
               ...base,
               every: 'week',
               timeZone: 'Europe/London',
            },
            new Date('2026-10-17T12:00:00Z')
         ).toISOString()
      ).toBe('2026-10-19T08:00:00.000Z')
      expect(
         nextScheduledRun(
            {
               ...base,
               every: 'hours',
               hours: 6,
            },
            new Date('2026-10-17T12:00:00Z')
         ).toISOString()
      ).toBe('2026-10-17T18:00:00.000Z')
   })

   it('should refuse an unknown time zone in a schedule block', () => {
      const graph: Graph = {
         ...flagship,
         nodes: flagship.nodes.map(node =>
            node.id === 'trigger'
               ? {
                    ...node,
                    type: 'trigger.schedule',
                    config: { timeZone: 'Mars/Base' },
                 }
               : node
         ),
      }

      expect(validateGraph(graph)).toEqual([expect.objectContaining({ nodeId: 'trigger' })])
      expect(scheduleOf(flagship)).toBeNull()
   })
})

describe('estimateGraph', () => {
   const available = {
      posts: 3,
      profiles: 40,
      companies: 4,
   }

   it('should price the worst case: every comment and reaction, every person enriched', () => {
      const { totalMicros, nodes } = estimateGraph(flagship, available)

      expect(nodes.posts.items).toBe(3)
      expect(nodes.commenters).toEqual({
         items: 300,
         costMicros: 600_000,
      })
      expect(nodes.enrich.costMicros).toBe(600 * 4_000)
      expect(totalMicros).toBe(600_000 * 2 + 2_400_000)
   })

   it('should shrink a preview to one post and 20 people per collect block', () => {
      const { totalMicros } = estimateGraph(previewGraph(flagship), available)

      expect(totalMicros).toBe(20 * 2_000 * 2 + 40 * 4_000)
   })

   it('should price "All" comments at the safety cap and never let a preview read all', () => {
      const all: Graph = {
         ...flagship,
         nodes: flagship.nodes.map(node =>
            node.id === 'commenters'
               ? {
                    ...node,
                    config: { all: true },
                 }
               : node
         ),
      }

      expect(estimateGraph(all, available).nodes.commenters.items).toBe(3 * ALL_CAP)
      expect(previewGraph(all).nodes.find(({ id }) => id === 'commenters')?.config).toMatchObject({
         all: false,
         howMany: 20,
      })
   })

   it('should count every round of a loop', () => {
      const loop: Graph = {
         ...flagship,
         loopRounds: 2,
         edges: [
            ...flagship.edges,
            {
               from: 'enrich',
               to: 'dedupe',
            },
         ],
      }

      expect(estimateGraph(loop, available).nodes.enrich.costMicros).toBe(2 * 600 * 4_000)
   })

   it('should price people at a company with the page fee and skip enriching them again', () => {
      const accounts = templateGraph('accounts', {
         icpId: 'icp-1',
         posts: 10,
         perPost: 30,
      })
      const { nodes, totalMicros } = estimateGraph(accounts, available)

      expect(nodes.companies.items).toBe(4)
      expect(nodes.employees).toEqual({
         items: 120,
         costMicros: 4 * (30 * 4_000 + 2 * 100_000),
      })
      expect(totalMicros).toBe(nodes.employees.costMicros)
   })
})

describe('templates', () => {
   it.each(GOALS)('should build a valid %s workflow', goal => {
      const graph = templateGraph(goal, {
         icpId: 'icp-1',
         posts: 5,
         perPost: 20,
         keywords: 'outbound',
         customer: 'https://www.linkedin.com/in/ada',
         jobTitle: 'SDR',
         domains: ['stripe.com'],
      })

      // The address to send to is only set on the canvas.
      expect(validateGraph(graph).map(({ message }) => message)).toEqual(
         goal === 'newInJob' ? [expect.stringContaining('Send via API')] : []
      )
      expect(
         estimateGraph(graph, {
            posts: 1,
            profiles: 1,
            companies: 1,
         }).totalMicros
      ).toBeGreaterThan(0)
   })

   it.each(GOALS)('should lay the %s workflow out top to bottom', goal => {
      const graph = templateGraph(goal, {
         icpId: 'icp-1',
         posts: 5,
         perPost: 20,
      })
      const yOf = (id: string) => graph.nodes.find(node => node.id === id)?.position.y ?? Number.NaN

      expect(graph.edges.every(({ from, to }) => yOf(to) > yOf(from))).toBe(true)
   })

   it('should list every template once, grouped, with a cost per run and no supplier name', () => {
      const templates = templateCatalog()

      expect(templates.map(({ id }) => id)).toEqual([...GOALS])
      expect(templates.every(({ costMicros }) => costMicros > 0)).toBe(true)
      expect(templates.find(({ id }) => id === 'decisionMakers')).toMatchObject({
         useCaseLabel: 'Find new leads',
         costMicros: 50 * 4_000,
      })
      expect(JSON.stringify(templates).toLowerCase()).not.toMatch(/mindcase|apify/)
   })
})

describe('Account Actions', () => {
   const node = (id: string, type: BlockType, config: NodeConfig = {}) => ({
      id,
      type,
      config,
      position: {
         x: 0,
         y: 0,
      },
   })
   const chain = (...nodes: Graph['nodes']): Graph => ({
      nodes,
      edges: nodes.slice(1).map((next, index) => ({
         from: nodes[index]?.id ?? '',
         to: next.id,
      })),
   })

   it('should group the account block, both visit blocks and Write a post under "Account Actions"', () => {
      const groups = catalog()
         .filter(({ group }) => group === 'Account Actions')
         .map(({ type }) => type)

      expect(groups).toEqual(['account.select', 'account.visitProfile', 'account.visitCompany', 'account.writePost'])
   })

   it('should keep a post written in the block as text that reads as a post, and say so when it does not', () => {
      const parse = (post: string) => blockOf('account.writePost').config.safeParse({ post }).success
      const written = JSON.stringify([
         {
            id: 't1',
            type: 'TEXT',
            text: 'Hello',
         },
      ])

      expect(blockOf('account.writePost').config.safeParse({}).data).toEqual({ post: '[]' })
      expect(parse(written)).toBe(true)
      expect(parse('{}')).toBe(false)
      expect(parse('x'.repeat(40_001))).toBe(false)
   })

   it('should stop a Write a post block with nothing to post or no account block before it', () => {
      const written = JSON.stringify([
         {
            id: 't1',
            type: 'TEXT',
            text: 'Hello',
         },
      ])
      const empty = chain(
         node('start', 'trigger.manual'),
         node('pool', 'account.select', { accounts: ['a1'] }),
         node('post', 'account.writePost')
      )
      const lonely = chain(node('start', 'trigger.manual'), node('post', 'account.writePost', { post: written }))
      const good = chain(
         node('start', 'trigger.manual'),
         node('pool', 'account.select', { accounts: ['a1'] }),
         node('post', 'account.writePost', { post: written })
      )

      expect(errorsOf(validateGraph(empty)).map(({ nodeId }) => nodeId)).toEqual(['post'])
      expect(errorsOf(validateGraph(lonely)).map(({ nodeId }) => nodeId)).toEqual(['post'])
      expect(validateGraph(good).filter(({ nodeId }) => nodeId === 'pool' || nodeId === 'post')).toEqual([])
   })

   it('should stop a Write a post block whose file was not uploaded', () => {
      const notUploaded = JSON.stringify([
         {
            id: 'd1',
            type: 'DOCUMENT',
            file: {
               id: 'f1',
               name: 'a.pdf',
               bytes: 100,
            },
         },
      ])
      const graph = chain(
         node('start', 'trigger.manual'),
         node('pool', 'account.select', { accounts: ['a1'] }),
         node('post', 'account.writePost', { post: notUploaded })
      )

      expect(errorsOf(validateGraph(graph)).map(({ nodeId }) => nodeId)).toEqual(['post'])
   })

   it('should pass on what reaches Write a post and cost nothing', () => {
      const graph = chain(
         node('profiles', 'input.profiles', { links: ['https://www.linkedin.com/in/ada'] }),
         node('pool', 'account.select', { accounts: ['a1'] }),
         node('post', 'account.writePost')
      )
      const estimate = estimateGraph(graph, {
         posts: 0,
         profiles: 7,
         companies: 0,
      })

      expect(estimate.totalMicros).toBe(0)
      expect(estimate.nodes.post?.items).toBe(estimate.nodes.profiles?.items)
   })

   it('should need one to twenty different accounts', () => {
      const parse = (accounts: string[]) => blockOf('account.select').config.safeParse({ accounts }).success

      expect(parse(['a1'])).toBe(true)
      expect(parse([])).toBe(false)
      expect(parse(['a1', 'a1'])).toBe(false)
      expect(parse(Array.from({ length: 21 }, (_, index) => `a${index}`))).toBe(false)
   })

   it('should find the nearest account block before a block, and none when there is not one', () => {
      const graph = chain(
         node('start', 'trigger.manual'),
         node('far', 'account.select', { accounts: ['a1'] }),
         node('near', 'account.select', { accounts: ['a2'] }),
         node('go', 'account.visitProfile')
      )

      expect(nodeBefore(graph, 'go', 'account.select')?.id).toBe('near')
      expect(nodeBefore(graph, 'near', 'account.select')?.id).toBe('far')
      expect(nodeBefore(graph, 'start', 'account.select')).toBeNull()
   })

   it('should stop a visit block that has no account block before it, and only note an unused account block', () => {
      const lonely = chain(node('start', 'trigger.manual'), node('go', 'account.visitCompany'))
      const unused = chain(node('people', 'input.profiles'), node('pool', 'account.select', { accounts: ['a1'] }))
      const good = chain(
         node('people', 'input.profiles'),
         node('pool', 'account.select', { accounts: ['a1'] }),
         node('go', 'account.visitProfile')
      )

      expect(errorsOf(validateGraph(lonely)).map(({ nodeId }) => nodeId)).toEqual(['go'])
      expect(errorsOf(validateGraph(unused))).toEqual([])
      expect(validateGraph(unused).some(({ nodeId }) => nodeId === 'pool')).toBe(true)
      expect(validateGraph(good).filter(({ nodeId }) => nodeId === 'pool' || nodeId === 'go')).toEqual([])
   })

   it('should cost nothing and pass on what reaches the blocks', () => {
      const graph = chain(
         node('profiles', 'input.profiles', { links: ['https://www.linkedin.com/in/ada'] }),
         node('pool', 'account.select', { accounts: ['a1'] }),
         node('go', 'account.visitProfile')
      )
      const estimate = estimateGraph(graph, {
         posts: 0,
         profiles: 7,
         companies: 0,
      })

      expect(estimate.totalMicros).toBe(0)
      expect(estimate.nodes.go?.items).toBe(estimate.nodes.profiles?.items)
   })
})

describe('Wait, Task result and Retry', () => {
   const node = (id: string, type: BlockType, config: NodeConfig = {}) => ({
      id,
      type,
      config,
      position: {
         x: 0,
         y: 0,
      },
   })
   const chain = (...nodes: Graph['nodes']): Graph => ({
      nodes,
      edges: nodes.slice(1).map((next, index) => ({
         from: nodes[index]?.id ?? '',
         to: next.id,
      })),
   })

   it('should sit in the Logic group and take any items', () => {
      const logic = catalog().filter(({ type }) => ['logic.wait', 'logic.taskResult', 'logic.retry'].includes(type))

      expect(logic.map(({ type, group }) => [type, group])).toEqual([
         ['logic.wait', 'Logic'],
         ['logic.taskResult', 'Logic'],
         ['logic.retry', 'Logic'],
      ])
   })

   it('should take a fixed wait or a range, from 1 second to 1 hour, with the low end not above the high end', () => {
      const parse = (config: NodeConfig) => blockOf('logic.wait').config.safeParse(config).success

      expect(parse({})).toBe(true)
      expect(
         parse({
            mode: 'exact',
            seconds: 3600,
         })
      ).toBe(true)
      expect(
         parse({
            mode: 'exact',
            seconds: 0,
         })
      ).toBe(false)
      expect(
         parse({
            mode: 'exact',
            seconds: 3601,
         })
      ).toBe(false)
      expect(
         parse({
            mode: 'between',
            minSeconds: 20,
            maxSeconds: 60,
         })
      ).toBe(true)
      expect(
         parse({
            mode: 'between',
            minSeconds: 61,
            maxSeconds: 60,
         })
      ).toBe(false)
      expect(parse({ mode: 'sometimes' })).toBe(false)
   })

   it('should take 1 to 5 more tries and a pause of 0 to 1 hour', () => {
      const parse = (config: NodeConfig) => blockOf('logic.retry').config.safeParse(config).success

      expect(
         parse({
            times: 1,
            waitSeconds: 0,
         })
      ).toBe(true)
      expect(
         parse({
            times: 5,
            waitSeconds: 3600,
         })
      ).toBe(true)
      expect(parse({ times: 0 })).toBe(false)
      expect(parse({ times: 6 })).toBe(false)
      expect(parse({ waitSeconds: 3601 })).toBe(false)
   })

   it('should find the nearest block that does work, through the blocks that only pass things on, for any block type', () => {
      const graph = chain(
         node('find', 'collect.commenters'),
         node('retry', 'logic.retry'),
         node('pause', 'logic.wait'),
         node('result', 'logic.taskResult')
      )

      expect(workingBlockBefore(graph, 'result')?.id).toBe('find')
      expect(workingBlockBefore(graph, 'retry')?.id).toBe('find')
      expect(workingBlockBefore(graph, 'find')).toBeNull()
   })

   it('should say which blocks have a Retry or a Task result looking at them, and what the retry asks for', () => {
      const graph = chain(
         node('find', 'collect.commenters'),
         node('retry', 'logic.retry', {
            times: 3,
            waitSeconds: 10,
         })
      )
      const watched = chain(node('find', 'collect.commenters'), node('result', 'logic.taskResult'))

      expect(retriesOf(graph, 'find')).toEqual({
         times: 3,
         waitSeconds: 10,
      })
      expect(retriesOf(watched, 'find')).toBeNull()
      expect(isHandled(graph, 'find')).toBe(true)
      expect(isHandled(watched, 'find')).toBe(true)
      expect(isHandled(chain(node('find', 'collect.commenters'), node('list', 'output.list')), 'find')).toBe(false)
   })

   it('should stop a Task result or a Retry with no block before them, and a Retry that is not right after its block', () => {
      const alone = chain(node('result', 'logic.taskResult'))
      const apart = chain(node('find', 'collect.commenters'), node('pause', 'logic.wait'), node('retry', 'logic.retry'))
      const good = chain(
         node('find', 'collect.commenters'),
         node('retry', 'logic.retry'),
         node('result', 'logic.taskResult')
      )

      expect(errorsOf(validateGraph(alone)).map(({ nodeId }) => nodeId)).toEqual(['result'])
      expect(errorsOf(validateGraph(apart)).map(({ message }) => message)).toEqual([
         'Retry goes right after the block it repeats.',
      ])
      expect(errorsOf(validateGraph(good))).toEqual([])
   })

   it('should let an Else follow a Task result or a Retry', () => {
      const graph = chain(
         node('find', 'collect.commenters'),
         node('result', 'logic.taskResult'),
         node('else', 'logic.else')
      )

      expect(validateGraph(graph).some(({ nodeId }) => nodeId === 'else')).toBe(false)
   })

   it('should note when a visit block feeds a block that keeps results with no Task result between', () => {
      const keep = chain(
         node('people', 'input.profiles'),
         node('pool', 'account.select', { accounts: ['a1'] }),
         node('go', 'account.visitProfile'),
         node('list', 'output.list')
      )
      const split = chain(
         node('people', 'input.profiles'),
         node('pool', 'account.select', { accounts: ['a1'] }),
         node('go', 'account.visitProfile'),
         node('result', 'logic.taskResult'),
         node('list', 'output.list')
      )

      expect(validateGraph(keep).some(({ nodeId }) => nodeId === 'list')).toBe(true)
      expect(validateGraph(split).some(({ nodeId }) => nodeId === 'list')).toBe(false)
   })
})
