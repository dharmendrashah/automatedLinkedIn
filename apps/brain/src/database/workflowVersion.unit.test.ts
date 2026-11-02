import { describe, expect, it } from 'vitest'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { sameGraph, unheldFiles } from './workflowVersion'

// Which files a graph being forgotten still owns, and whether a save changed anything (.plan/workflow-engine-p5-editor.md).

const csv = (fileName: string): GraphNode => ({
   id: 'n',
   type: 'output.csv',
   config: { fileName },
   position: {
      x: 1,
      y: 2,
   },
})

describe('sameGraph', () => {
   it('should say a graph is the same when only the order of keys differs, and not when a setting changed', () => {
      const a: Graph = {
         nodes: [csv('x')],
         edges: [],
      }
      const reordered = JSON.parse(
         '{"edges":[],"nodes":[{"position":{"y":2,"x":1},"config":{"fileName":"x"},"type":"output.csv","id":"n"}]}'
      ) as Graph

      expect(sameGraph(a, reordered)).toBe(true)
      expect(
         sameGraph(a, {
            nodes: [csv('y')],
            edges: [],
         })
      ).toBe(false)
   })
})

describe('unheldFiles', () => {
   it('should list only the files nothing that stays refers to, each once', () => {
      expect(unheldFiles(['one', 'two', 'two', 'three'], ['two']).sort()).toEqual(['one', 'three'])
      expect(unheldFiles(['one', 'two'], [])).toEqual(['one', 'two'])
      expect(unheldFiles([], ['two'])).toEqual([])
   })
})
