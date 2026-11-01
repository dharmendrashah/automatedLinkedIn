import { describe, expect, it } from 'vitest'

import { type Graph } from '@automatedLinkedIn/contracts'

import { backSources, forwardSources, inputKeys, sourceRound } from './workflowInput'

const node = (id: string, type: Graph['nodes'][number]['type']) => ({
   id,
   type,
   config: {},
   position: {
      x: 0,
      y: 0,
   },
})

const line = (from: string, to: string) => ({
   from,
   to,
})

const graph: Graph = {
   nodes: [node('a', 'input.profiles'), node('b', 'logic.if'), node('else', 'logic.else'), node('c', 'output.csv')],
   edges: [line('a', 'b'), line('b', 'c'), line('b', 'else')],
}

const ran =
   (...keys: string[]) =>
   (nodeId: string, round: number) =>
      keys.includes(`${nodeId}#${round}`)

describe('where the items that reach a block are kept', () => {
   it('should read the blocks before it that have a step in the same round', () => {
      expect(inputKeys(graph, node('c', 'output.csv'), 0, ran('b#0'))).toEqual([
         {
            nodeId: 'b',
            round: 0,
         },
      ])
      expect(inputKeys(graph, node('c', 'output.csv'), 0, ran())).toEqual([])
   })

   it('should read what an If kept aside for an Else, and not what it passed on', () => {
      expect(inputKeys(graph, node('else', 'logic.else'), 0, ran('b#0'))).toEqual([
         {
            nodeId: 'b~else',
            round: 0,
         },
      ])
   })

   it('should read what an If kept aside over a line from its else output, with no Else block', () => {
      const ports: Graph = {
         nodes: [node('b', 'logic.if'), node('c', 'output.csv'), node('d', 'output.csv')],
         edges: [
            {
               ...line('b', 'c'),
               fromPort: 'else',
            },
            line('b', 'd'),
         ],
      }

      expect(inputKeys(ports, node('c', 'output.csv'), 0, ran('b#0'))).toEqual([
         {
            nodeId: 'b~else',
            round: 0,
         },
      ])
      expect(inputKeys(ports, node('d', 'output.csv'), 0, ran('b#0'))).toEqual([
         {
            nodeId: 'b',
            round: 0,
         },
      ])
   })

   it('should always read the first round for a For each', () => {
      expect(sourceRound('logic.forEach', 3)).toBe(0)
      expect(sourceRound('output.csv', 3)).toBe(3)
      expect(forwardSources(graph, node('b', 'logic.forEach'), 2, ran('a#0')).map(({ round }) => round)).toEqual([0])
   })

   it('should add what the round before found over a loop line, and only from the second round', () => {
      const loop: Graph = {
         nodes: [node('a', 'input.profiles'), node('b', 'logic.if'), node('c', 'process.dedupe')],
         edges: [line('a', 'b'), line('b', 'c'), line('c', 'b')],
      }
      const sources = (round: number) => inputKeys(loop, node('b', 'logic.if'), round, ran('a#0', 'a#1'))

      expect(backSources(loop, 'b')).toEqual(['c'])
      expect(sources(0)).toEqual([
         {
            nodeId: 'a',
            round: 0,
         },
      ])
      expect(sources(1)).toEqual([
         {
            nodeId: 'a',
            round: 1,
         },
         {
            nodeId: 'c',
            round: 0,
         },
      ])
   })
})
