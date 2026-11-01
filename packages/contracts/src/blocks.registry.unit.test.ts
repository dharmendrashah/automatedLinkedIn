import { describe, expect, it } from 'vitest'

import { BLOCK_TYPES, type Graph, type GraphNode, blockOf, catalog, upgradeConfig, upgradeGraph } from './workflow'

// A block is complete when its definition says everything the engine, the checks and the browser need
// (.plan/workflow-engine-p1-block-definition.md). Adding a block adds it to this list of checks by itself.

const available = {
   posts: 7,
   profiles: 9,
   companies: 5,
}

const keysOf = (config: unknown) => {
   const { shape } = config as { shape?: Record<string, unknown> }

   return shape ? Object.keys(shape) : null
}

describe.each(BLOCK_TYPES)('block %s', type => {
   const spec = blockOf(type)
   const node: GraphNode = {
      id: 'block',
      type,
      config: (spec.config.safeParse({}).data ?? {}) as GraphNode['config'],
      position: {
         x: 0,
         y: 0,
      },
   }

   it('should say what it is and what it does', () => {
      expect(spec.label.trim()).not.toBe('')
      expect(spec.summary.trim()).not.toBe('')
   })

   it('should ask for settings that exist', () => {
      const keys = keysOf(spec.config)

      if (keys) {
         expect(spec.fields.map(({ key }) => key).filter(key => !keys.includes(key))).toEqual([])
      }
   })

   it('should have a version, and a way up from every earlier one', () => {
      const version = spec.version ?? 1

      expect(Number.isInteger(version) && version >= 1).toBe(true)

      for (let from = 1; from < version; from += 1) {
         expect(spec.migrate?.[from]).toBeTypeOf('function')
      }
   })

   it('should keep a preview to a positive size, and an estimate to numbers that are not negative', () => {
      expect(spec.previewCap === undefined || (Number.isInteger(spec.previewCap) && spec.previewCap > 0)).toBe(true)

      for (const incoming of [0, 10]) {
         const { items, costMicros } = spec.estimate?.(node, incoming, available) ?? {
            items: 0,
            costMicros: 0,
         }

         expect(Number.isFinite(items) && items >= 0).toBe(true)
         expect(Number.isFinite(costMicros) && costMicros >= 0).toBe(true)
      }
   })

   it('should have a check that answers with a list', () => {
      const graph: Graph = {
         nodes: [node],
         edges: [],
      }

      expect(Array.isArray(spec.validate?.(node, graph) ?? [])).toBe(true)
   })

   it('should reach the browser with everything it shows', () => {
      const [block] = catalog().filter(each => each.type === type)

      expect(block).toMatchObject({
         version: spec.version ?? 1,
         deprecated: spec.deprecated === true,
      })
      expect(block?.flags).toEqual(spec.flags ?? {})
   })
})

describe('blocks that visit pages', () => {
   it('should use the accounts of a Select accounts block', () => {
      for (const type of BLOCK_TYPES.filter(each => blockOf(each).flags?.visit)) {
         expect(blockOf(type).flags?.usesAccounts).toBe(true)
      }
   })
})

describe('upgrading what was saved', () => {
   const upgrades = {
      1: (config: Record<string, string | number | boolean | string[]>) => ({
         ...config,
         wait: Number(config.seconds ?? 0),
      }),
      2: (config: Record<string, string | number | boolean | string[]>) => ({
         ...config,
         unit: 'seconds',
      }),
   }

   it('should apply each step from the saved version up to the current one, in order', () => {
      expect(upgradeConfig({ seconds: 5 }, 1, 3, upgrades)).toEqual({
         seconds: 5,
         wait: 5,
         unit: 'seconds',
      })
      expect(upgradeConfig({ seconds: 5 }, 2, 3, upgrades)).toEqual({
         seconds: 5,
         unit: 'seconds',
      })
   })

   it('should leave settings as they are when there is no step to take', () => {
      const config = { seconds: 5 }

      expect(upgradeConfig(config, 1, 1, upgrades)).toBe(config)
      expect(upgradeConfig(config, 1, 3)).toEqual(config)
   })

   it('should leave a graph of blocks at their current version, and one saved by newer code, untouched', () => {
      const graph: Graph = {
         nodes: [
            {
               id: 'a',
               type: 'logic.wait',
               config: { amount: 1 },
               position: {
                  x: 0,
                  y: 0,
               },
            },
            {
               id: 'b',
               type: 'logic.wait',
               version: 9,
               config: { amount: 2 },
               position: {
                  x: 0,
                  y: 0,
               },
            },
         ],
         edges: [],
      }

      expect(upgradeGraph(graph).nodes).toEqual(graph.nodes)
   })
})
