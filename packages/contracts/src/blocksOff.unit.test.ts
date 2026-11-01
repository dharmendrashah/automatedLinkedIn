import { describe, expect, it } from 'vitest'

import { type BlockType, type Graph, estimateGraph, isOff, validateGraph } from './workflow'

// A block that is switched off passes everything on without running (.plan/workflow-engine-p5-editor.md).

const node = (
   id: string,
   type: BlockType,
   config: Record<string, string | number | boolean | string[]> = {},
   off = false
) => ({
   id,
   type,
   config,
   ...(off ? { disabled: true } : {}),
   position: {
      x: 0,
      y: 0,
   },
})

const line = (from: string, to: string) => ({
   from,
   to,
})

const available = {
   posts: 0,
   profiles: 10,
   companies: 0,
}

describe('isOff', () => {
   it('should be true for a block flagged off, and never for a trigger or a block without the flag', () => {
      expect(isOff(node('a', 'output.csv', {}, true))).toBe(true)
      expect(isOff(node('a', 'output.csv'))).toBe(false)
      expect(isOff(node('a', 'trigger.manual', {}, true))).toBe(false)
   })
})

describe('a block that is switched off', () => {
   const graph = (off: boolean): Graph => ({
      nodes: [
         node('begin', 'trigger.manual'),
         node('people', 'input.profiles', { howMany: 5 }),
         node('who', 'collect.searchPeople', { keywords: 'sales' }, off),
      ],
      edges: [line('begin', 'people'), line('people', 'who')],
   })

   it('should cost nothing and pass on what reaches it', () => {
      const on = estimateGraph(graph(false), available)
      const off = estimateGraph(graph(true), available)

      expect(on.nodes.who?.costMicros).toBeGreaterThan(0)
      expect(off.nodes.who).toEqual({
         items: off.nodes.people?.items,
         costMicros: 0,
      })
   })

   it('should not check its settings, and say that it is off', () => {
      const unfinished: Graph = {
         nodes: [node('people', 'input.profiles'), node('who', 'collect.searchPeople', {}, true)],
         edges: [line('people', 'who')],
      }
      const problems = validateGraph(unfinished)

      expect(problems.filter(({ level, nodeId }) => level === 'error' && nodeId === 'who')).toEqual([])
      expect(problems).toContainEqual(
         expect.objectContaining({
            nodeId: 'who',
            level: 'note',
            message: expect.stringContaining('switched off'),
         })
      )
   })
})
