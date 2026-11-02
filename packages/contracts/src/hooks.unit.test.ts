import { describe, expect, it } from 'vitest'

import { HOOK_START_ID, splitHooks } from './hooks'
import { type Graph, type GraphNode, errorsOf, validateGraph } from './workflow'

const node = (
   id: string,
   type: GraphNode['type'],
   config: GraphNode['config'] = {},
   more: Partial<GraphNode> = {}
) => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
   ...more,
})

// A schedule feeds a visit-free flow: manual -> tag -> csv, with a chain "tell my system" on the after of the tag.
const withHook = (): Graph => ({
   nodes: [
      node('go', 'trigger.manual'),
      node('tag', 'process.tag', { tags: ['x'] }, { hooks: { after: { when: 'always' } } }),
      node('csv', 'output.csv'),
      node('ping', 'output.sendApi', { url: 'https://example.com/hook' }),
   ],
   edges: [
      {
         from: 'go',
         to: 'tag',
      },
      {
         from: 'tag',
         to: 'csv',
      },
      {
         from: 'tag',
         to: 'ping',
         fromPort: 'after',
      },
   ],
})

describe('splitHooks', () => {
   it('should return a graph without hook lines as it is', () => {
      const graph: Graph = {
         nodes: [node('go', 'trigger.manual'), node('csv', 'output.csv')],
         edges: [
            {
               from: 'go',
               to: 'csv',
            },
         ],
      }

      expect(splitHooks(graph).main).toBe(graph)
      expect(splitHooks(graph).attachments).toEqual([])
   })

   it('should take the chain out of the main flow and make a small workflow of it', () => {
      const { main, attachments, problems } = splitHooks(withHook())

      expect(problems).toEqual([])
      expect(main.nodes.map(({ id }) => id)).toEqual(['go', 'tag', 'csv'])
      expect(main.edges).toEqual([
         {
            from: 'go',
            to: 'tag',
         },
         {
            from: 'tag',
            to: 'csv',
         },
      ])
      expect(attachments).toHaveLength(1)
      expect(attachments[0]).toMatchObject({
         host: 'tag',
         phase: 'after',
         options: {
            when: 'always',
            fires: 'each',
         },
      })
      expect(attachments[0].graph.nodes.map(({ id }) => id)).toEqual([HOOK_START_ID, 'ping'])
      expect(attachments[0].graph.edges).toEqual([
         {
            from: HOOK_START_ID,
            to: 'ping',
         },
      ])
   })

   it('should let one chain hang on several hooks, each with its own small workflow', () => {
      const graph = withHook()

      graph.edges.push({
         from: 'csv',
         to: 'ping',
         fromPort: 'before',
      })

      const { attachments, problems } = splitHooks(graph)

      expect(problems).toEqual([])
      expect(attachments.map(({ host, phase }) => `${host}:${phase}`)).toEqual(['tag:after', 'csv:before'])
   })

   it('should refuse a hook inside a hook, and a block that is in a hook and in the main flow', () => {
      const nested = withHook()

      nested.edges.push({
         from: 'ping',
         to: 'csv',
         fromPort: 'on',
      })

      expect(splitHooks(nested).problems.map(({ message }) => message)).toContain(
         'A block inside a hook cannot have hooks of its own.'
      )

      const crossed = withHook()

      crossed.edges.push({
         from: 'go',
         to: 'ping',
      })

      expect(splitHooks(crossed).problems.map(({ message }) => message)).toContain(
         'ping is in a hook and also connected to the main flow. A hook stands apart from the main flow.'
      )
   })

   it('should keep the name of a block in the message', () => {
      const graph = withHook()

      graph.nodes[3] = node('ping', 'output.sendApi', { url: 'https://example.com/hook' }, { label: 'Tell my system' })
      graph.edges.push({
         from: 'go',
         to: 'ping',
      })

      expect(splitHooks(graph).problems[0].message).toContain('Tell my system')
   })
})

describe('validateGraph with hooks', () => {
   it('should add no error for a good hook and check the chain as a workflow of its own', () => {
      expect(errorsOf(validateGraph(withHook()))).toEqual([])
   })

   it('should find an error inside a chain, with the block it is about', () => {
      const graph = withHook()

      graph.nodes[3] = node('ping', 'account.sendMessage', { text: 'Hi' })

      expect(errorsOf(validateGraph(graph))).toEqual([
         expect.objectContaining({
            nodeId: 'ping',
            message: 'Send message needs "Select accounts" before it, or one account picked on the block.',
         }),
      ])
   })

   it('should refuse the reserved id of the hook start block', () => {
      const graph: Graph = {
         nodes: [node('__hook', 'output.csv')],
         edges: [],
      }

      expect(errorsOf(validateGraph(graph)).map(({ message }) => message)).toContain(
         'Block ids starting with __ are reserved.'
      )
   })
})
