import { describe, expect, it } from 'vitest'

import { type Block, type Graph } from './types'

import { canConnect, choicesFor, newNodeId, toFlow, toGraph } from './graph-convert'

const block = (type: Block['type'], input: Block['input'], output: Block['output']): Block => ({
   type,
   group: 'Process',
   label: type,
   summary: '',
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
               itemsIn: 0,
               itemsOut: 3,
               costMicros: 0,
               message: null,
            },
         ],
      })

      expect(edges[0].label).toBe('3 posts')
      expect(toGraph(nodes, edges).nodes[1].position.x).toBe(240)
      expect(toGraph(nodes, edges).edges).toEqual(graph.edges)
   })

   it('should only join ports of the same kind, once, and never a block to itself', () => {
      const { nodes, edges } = toFlow(graph, catalog)

      expect(canConnect(nodes, edges, 'commenters', 'score')).toBe(true)
      expect(canConnect(nodes, edges, 'posts', 'score')).toBe(false)
      expect(canConnect(nodes, edges, 'posts', 'commenters')).toBe(false)
      expect(canConnect(nodes, edges, 'score', 'score')).toBe(false)
   })

   it('should name a new block after its type without clashing', () => {
      expect(newNodeId('collect.commenters', [{ id: 'commenters-1' }])).toBe('commenters-2')
   })

   it('should offer only blocks that take what the chosen block gives, filtered by the search', () => {
      const types = (blocks: Block[]) => blocks.map(({ type }) => type)

      expect(types(choicesFor(catalog, catalog[0], ''))).toEqual(['collect.commenters'])
      expect(types(choicesFor(catalog, null, 'SCORE'))).toEqual(['score.icp'])
      expect(choicesFor(catalog, block('output.list', 'profile', null), '')).toEqual([])
   })
})
