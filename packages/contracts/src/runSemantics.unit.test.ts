import { describe, expect, it } from 'vitest'

import {
   type BlockType,
   type Graph,
   catalog,
   executionOrder,
   isFired,
   outputsOf,
   portKey,
   portOfEdge,
   validateGraph,
} from './workflow'

// What starts a run, in which order blocks go, and which output a line leaves from
// (.plan/workflow-engine-p2-run-semantics.md).

const node = (id: string, type: BlockType, x = 0, y = 0) => ({
   id,
   type,
   config: {},
   position: {
      x,
      y,
   },
})

const line = (from: string, to: string) => ({
   from,
   to,
})

describe('isFired', () => {
   const graph: Graph = {
      nodes: [node('manual', 'trigger.manual'), node('daily', 'trigger.schedule'), node('call', 'trigger.api')],
      edges: [],
   }

   it('should fire every trigger for a run by hand or a preview', () => {
      for (const start of ['MANUAL', 'PREVIEW'] as const) {
         expect(isFired(graph, start, 'trigger.manual')).toBe(true)
         expect(isFired(graph, start, 'trigger.schedule')).toBe(true)
         expect(isFired(graph, start, 'trigger.api')).toBe(true)
      }
   })

   it('should fire only the triggers of the kind that started the run', () => {
      expect(isFired(graph, 'SCHEDULE', 'trigger.schedule')).toBe(true)
      expect(isFired(graph, 'SCHEDULE', 'trigger.api')).toBe(false)
      expect(isFired(graph, 'SCHEDULE', 'trigger.manual')).toBe(false)
      expect(isFired(graph, 'API', 'trigger.api')).toBe(true)
      expect(isFired(graph, 'API', 'trigger.schedule')).toBe(false)
   })

   it('should fire every trigger when the graph has none of the kind that started the run', () => {
      const onlyManual: Graph = {
         nodes: [node('manual', 'trigger.manual')],
         edges: [],
      }

      expect(isFired(onlyManual, 'API', 'trigger.manual')).toBe(true)
      expect(isFired(onlyManual, 'WORKFLOW', 'trigger.manual')).toBe(true)
      expect(isFired(onlyManual, 'SCHEDULE', 'trigger.manual')).toBe(true)
   })
})

describe('executionOrder', () => {
   it('should finish one branch before the next, the branch at the top first', () => {
      const graph: Graph = {
         nodes: [
            node('start', 'trigger.manual', 0, 0),
            node('low', 'input.profiles', 0, 200),
            node('lowNext', 'output.csv', 0, 300),
            node('high', 'input.posts', 0, 100),
            node('highNext', 'output.csv', 0, 150),
         ],
         edges: [line('start', 'low'), line('low', 'lowNext'), line('start', 'high'), line('high', 'highNext')],
      }

      expect(executionOrder(graph)).toEqual(['start', 'high', 'highNext', 'low', 'lowNext'])
   })

   it('should put the left branch first when two are level, then the one with the smaller id', () => {
      const graph: Graph = {
         nodes: [
            node('start', 'trigger.manual'),
            node('b', 'output.csv', 100, 100),
            node('a', 'output.csv', 100, 100),
            node('left', 'output.csv', 0, 100),
         ],
         edges: [line('start', 'b'), line('start', 'a'), line('start', 'left')],
      }

      expect(executionOrder(graph)).toEqual(['start', 'left', 'a', 'b'])
   })

   it('should list every block once, a join where its first line reaches it, and a loop without end', () => {
      const graph: Graph = {
         nodes: [
            node('start', 'trigger.manual'),
            node('x', 'output.csv', 0, 100),
            node('y', 'output.csv', 100, 100),
            node('join', 'output.list', 0, 200),
            node('loopA', 'process.filter', 300, 0),
            node('loopB', 'process.filter', 300, 100),
         ],
         edges: [
            line('start', 'x'),
            line('start', 'y'),
            line('x', 'join'),
            line('y', 'join'),
            line('loopA', 'loopB'),
            line('loopB', 'loopA'),
         ],
      }
      const order = executionOrder(graph)

      expect([...order].sort()).toEqual(['join', 'loopA', 'loopB', 'start', 'x', 'y'])
      expect(order.indexOf('x')).toBeLessThan(order.indexOf('y'))
   })
})

describe('portOfEdge', () => {
   it('should read the else output into an Else block and the main output everywhere else', () => {
      const graph: Graph = {
         nodes: [node('ok', 'logic.if'), node('rest', 'logic.else'), node('next', 'output.csv')],
         edges: [line('ok', 'rest'), line('ok', 'next')],
      }

      expect(portOfEdge(graph, line('ok', 'rest'))).toBe('else')
      expect(portOfEdge(graph, line('ok', 'next'))).toBe('main')
   })

   it('should read the output a line names, even into an Else block', () => {
      const graph: Graph = {
         nodes: [node('ok', 'logic.if'), node('rest', 'logic.else'), node('next', 'output.csv')],
         edges: [],
      }

      expect(
         portOfEdge(graph, {
            ...line('ok', 'next'),
            fromPort: 'else',
         })
      ).toBe('else')
      expect(
         portOfEdge(graph, {
            ...line('ok', 'rest'),
            fromPort: 'main',
         })
      ).toBe('main')
   })
})

describe('outputs', () => {
   it('should give a block that keeps items aside a main and an else output, and any other block main', () => {
      expect(outputsOf('logic.if')).toEqual(['main', 'else'])
      expect(outputsOf('logic.runWorkflow')).toEqual(['main', 'else'])
      expect(outputsOf('output.csv')).toEqual(['main'])
      expect(catalog().find(({ type }) => type === 'logic.if')?.outputs).toEqual(['main', 'else'])
   })

   it('should key main under the block and any other output under the block and its name', () => {
      expect(portKey('ok', 'main')).toBe('ok')
      expect(portKey('ok', 'else')).toBe('ok~else')
   })

   it('should refuse a line from an output the block does not have, and accept one it has', () => {
      const graph = (fromPort: string): Graph => ({
         nodes: [node('ok', 'logic.if'), node('next', 'output.csv')],
         edges: [
            {
               ...line('ok', 'next'),
               fromPort,
            },
         ],
      })

      expect(validateGraph(graph('else')).filter(({ level }) => level === 'error')).toEqual([])
      expect(validateGraph(graph('later')).filter(({ level }) => level === 'error')).toEqual([
         expect.objectContaining({
            nodeId: 'ok',
            message: 'If has no "later" output.',
         }),
      ])
      expect(
         validateGraph({
            nodes: [node('a', 'input.profiles'), node('next', 'output.csv')],
            edges: [
               {
                  ...line('a', 'next'),
                  fromPort: 'else',
               },
            ],
         }).filter(({ level }) => level === 'error')
      ).toHaveLength(1)
   })
})
