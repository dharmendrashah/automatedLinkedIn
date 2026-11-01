import { describe, expect, it } from 'vitest'

import {
   BLOCK_TYPES,
   type BlockType,
   ELSE_SOURCES,
   GOALS,
   type Graph,
   POOL_BLOCKS,
   TAKES_ANYTHING,
   VISIT_BLOCKS,
   blockOf,
   estimateGraph,
   previewGraph,
   templateGraph,
   validateGraph,
} from './workflow'

// What the blocks answer today, written down before a block became one definition (.plan/workflow-engine-p1-block-definition.md).
// The snapshot must not change when behaviour moves into the definitions.

const available = {
   posts: 7,
   profiles: 9,
   companies: 5,
}

const node = (id: string, type: BlockType, config: Record<string, string | number | boolean | string[]> = {}) => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const sorted = (set: Set<string>) => [...set].sort()

const after = (type: BlockType, config: Record<string, string | number | boolean | string[]>): Graph => ({
   nodes: [node('first', 'input.profiles', { howMany: 10 }), node('block', type, config)],
   edges: [
      {
         from: 'first',
         to: 'block',
      },
   ],
})

const options = {
   icpId: 'icp1',
   posts: 5,
   perPost: 50,
   keywords: 'sales',
   customer: 'https://www.linkedin.com/in/ada',
   titles: ['founder'],
   jobTitle: 'engineer',
   domains: ['a.com', 'b.com'],
   timeZone: 'UTC',
}

describe('blocks before they became one definition', () => {
   it('should keep the sets of blocks with a role', () => {
      expect({
         elseSources: sorted(ELSE_SOURCES),
         takesAnything: sorted(TAKES_ANYTHING),
         pool: sorted(POOL_BLOCKS),
         visit: sorted(VISIT_BLOCKS),
      }).toMatchSnapshot()
   })

   it('should keep what every block costs and passes on, and what a preview keeps of its size', () => {
      const answers = BLOCK_TYPES.map(type => {
         const plain = blockOf(type).config.safeParse({}).data ?? {}
         const sized = {
            howMany: 7,
            domains: ['a.com', 'b.com'],
         }
         const graph = after(type, sized)

         return {
            type,
            plain: estimateGraph(after(type, plain as Record<string, string>), available).nodes.block,
            sized: estimateGraph(graph, available).nodes.block,
            preview: previewGraph({
               nodes: [node('block', type, { howMany: 500 })],
               edges: [],
            }).nodes[0]?.config,
         }
      })

      expect(answers).toMatchSnapshot()
   })

   it('should keep what every template costs, what its preview is and what it says about itself', () => {
      const answers = GOALS.map(goal => {
         const graph = templateGraph(goal, options)

         return {
            goal,
            estimate: estimateGraph(graph, available),
            preview: previewGraph(graph),
            problems: validateGraph(graph),
         }
      })

      expect(answers).toMatchSnapshot()
   })
})
