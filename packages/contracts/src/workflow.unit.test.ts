import { describe, expect, it } from 'vitest'

import {
   GOALS,
   type Graph,
   catalog,
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

   it('should refuse a connection between ports of different kinds', () => {
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

      expect(validateGraph(graph)).toContainEqual({
         nodeId: 'score',
         message: 'Posts gives posts, but Score against an ideal customer needs people.',
      })
   })

   it('should refuse a loop, a missing trigger, an orphan and a list without scoring', () => {
      const loop: Graph = {
         ...flagship,
         edges: [
            ...flagship.edges,
            {
               from: 'enrich',
               to: 'dedupe',
            },
         ],
      }

      expect(validateGraph(loop).map(({ message }) => message)).toContain(
         'The blocks form a loop. A workflow must flow one way.'
      )
      expect(validateGraph(without(flagship, 'trigger')).map(({ message }) => message)).toEqual(
         expect.arrayContaining([
            'A workflow needs exactly one trigger.',
            'Posts is not connected to anything before it.',
         ])
      )

      const unscored: Graph = {
         nodes: without(flagship, 'score').nodes,
         edges: [
            ...without(flagship, 'score').edges,
            {
               from: 'dedupe',
               to: 'enrich',
            },
         ],
      }

      expect(validateGraph(unscored)).toContainEqual({
         nodeId: 'list',
         message: 'Add to list needs a "Score against an ideal customer" block before it.',
      })
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
