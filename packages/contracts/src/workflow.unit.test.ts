import { describe, expect, it } from 'vitest'

import {
   GOALS,
   type Graph,
   catalog,
   errorsOf,
   estimateGraph,
   flagshipGraph,
   nextScheduledRun,
   previewGraph,
   scheduleOf,
   templateGraph,
   validateGraph,
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

describe('workflow catalog', () => {
   it('should give every block defaults that pass its own schema and never name a supplier', () => {
      const blocks = catalog()

      expect(blocks.find(block => block.type === 'collect.commenters')?.defaults).toEqual({ howMany: 50 })
      expect(JSON.stringify(blocks).toLowerCase()).not.toMatch(/mindcase|apify/)
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
         'Else passes on nothing unless an If comes right before it.',
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
   const base = {
      hours: 24,
      at: '09:00',
      weekday: 1,
      timeZone: 'Asia/Kolkata',
   }

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
      })

      expect(validateGraph(graph)).toEqual([])
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
})
