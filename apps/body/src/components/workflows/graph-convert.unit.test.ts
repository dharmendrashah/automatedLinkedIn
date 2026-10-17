import { describe, expect, it } from 'vitest'

import { type Block, type Graph } from './types'

import { canConnect, choicesFor, combineRounds, hasLoop, newNodeId, toFlow, toGraph } from './graph-convert'

const block = (type: Block['type'], input: Block['input'], output: Block['output']): Block => ({
   type,
   group: 'Process',
   label: type,
   summary: '',
   costHint: null,
   presets: [],
   input,
   output,
   fields: [],
   defaults: {},
})

const catalog = [
   block('input.posts', 'start', 'post'),
   block('collect.commenters', 'post', 'profile'),
   block('score.icp', 'profile', 'profile'),
]

const graph: Graph = {
   nodes: [
      {
         id: 'posts',
         type: 'input.posts',
         config: { howMany: 3 },
         position: {
            x: 0,
            y: 0,
         },
      },
      {
         id: 'commenters',
         type: 'collect.commenters',
         config: {},
         position: {
            x: 240.4,
            y: 0,
         },
      },
      {
         id: 'score',
         type: 'score.icp',
         config: {},
         position: {
            x: 480,
            y: 0,
         },
      },
   ],
   edges: [
      {
         from: 'posts',
         to: 'commenters',
      },
   ],
}

describe('graph-convert', () => {
   it('should round-trip a graph and label edges with what the run passed along', () => {
      const { nodes, edges } = toFlow(graph, catalog, {
         steps: [
            {
               nodeId: 'posts',
               type: 'input.posts',
               status: 'DONE',
               round: 0,
               itemsIn: 0,
               itemsOut: 3,
               costMicros: 0,
               message: null,
               childRunId: null,
               child: null,
            },
         ],
      })

      expect(edges[0].label).toBe('3 posts')
      expect(toGraph(nodes, edges).nodes[1].position.x).toBe(240)
      expect(toGraph(nodes, edges).edges).toEqual([
         {
            ...graph.edges[0],
            fromSide: 'bottom',
            toSide: 'top',
         },
      ])
   })

   it('should join any two blocks once, and never a block to itself', () => {
      const { edges } = toFlow(graph, catalog)

      expect(canConnect(edges, 'posts', 'score')).toBe(true)
      expect(canConnect(edges, 'posts', 'commenters')).toBe(false)
      expect(canConnect(edges, 'score', 'score')).toBe(false)
      expect(hasLoop(edges)).toBe(false)
      expect(
         hasLoop([
            ...edges,
            {
               source: 'commenters',
               target: 'posts',
            },
         ])
      ).toBe(true)
   })

   it('should add up the rounds of a block and keep the most telling state', () => {
      const step = {
         nodeId: 'each',
         type: 'logic.forEach',
         itemsIn: 2,
         itemsOut: 2,
         costMicros: 10,
         message: null,
         childRunId: null,
         child: null,
      }
      const combined = combineRounds([
         {
            ...step,
            status: 'DONE',
            round: 0,
         },
         {
            ...step,
            status: 'RUNNING',
            round: 1,
         },
      ]).get('each')

      expect(combined).toMatchObject({
         status: 'RUNNING',
         itemsOut: 4,
         costMicros: 20,
         round: 1,
      })
   })

   it('should name a new block after its type without clashing', () => {
      expect(newNodeId('collect.commenters', [{ id: 'commenters-1' }])).toBe('commenters-2')
   })

   it('should offer every block but a trigger after a block, filtered by the search', () => {
      const types = (blocks: Block[]) => blocks.map(({ type }) => type)
      const withTrigger = [block('trigger.manual', null, 'start'), ...catalog]

      expect(types(choicesFor(withTrigger, catalog[0], ''))).toEqual(types(catalog))
      expect(types(choicesFor(withTrigger, null, 'SCORE'))).toEqual(['score.icp'])
   })
})
