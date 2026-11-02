import { z } from 'zod'

import type { Graph, GraphEdge, GraphError, GraphNode } from './workflow'

// Before, on and after hooks on every block (.plan/workflow-events-and-hooks.md). A hook is a line from a block's before, on or after
// output to blocks that run as their own small run when that moment comes. The chain stays on the canvas, attached to its block; the run
// never sees a hook line, because the graph is split when the run starts.

export const HOOK_PORTS = ['before', 'on', 'after'] as const

export type HookPort = (typeof HOOK_PORTS)[number]

export const isHookPort = (port: string | undefined): port is HookPort =>
   port !== undefined && (HOOK_PORTS as readonly string[]).includes(port)

// How one hook behaves: fire only when something reached or left the block (`items`) or always, and every time the block runs or once
// a run; `off` pauses it without removing it. Saved as the owner set it; `hookOptionsOf` fills in what was left out.
export const hookOptionsSchema = z.object({
   when: z.enum(['items', 'always']).optional(),
   fires: z.enum(['each', 'once']).optional(),
   off: z.boolean().optional(),
})

export type HookOptions = { when: 'items' | 'always'; fires: 'each' | 'once'; off: boolean }

export const hookOptionsOf = (stored?: z.infer<typeof hookOptionsSchema>): HookOptions => ({
   when: stored?.when ?? 'items',
   fires: stored?.fires ?? 'each',
   off: stored?.off === true,
})

export const hooksSchema = z.object({
   before: hookOptionsSchema.optional(),
   on: hookOptionsSchema.optional(),
   after: hookOptionsSchema.optional(),
})

// The block a hook run starts from; made by the split, never saved in a workflow.
export const HOOK_START_ID = '__hook'

export type HookAttachment = {
   host: string
   phase: HookPort
   options: HookOptions
   // The small workflow that runs: the start block and what hangs on this hook.
   graph: Graph
}

export type HookSplit = {
   // The graph without hook lines and the blocks only they lead to.
   main: Graph
   attachments: HookAttachment[]
   // The blocks that belong to a chain.
   chainNodeIds: Set<string>
   problems: GraphError[]
}

const isHookLine = (edge: GraphEdge) => isHookPort(edge.fromPort)

const reachable = (edges: GraphEdge[], seeds: string[]) => {
   const found = new Set(seeds)
   const queue = [...seeds]

   while (queue.length > 0) {
      const id = queue.shift() ?? ''

      for (const { to } of edges.filter(edge => edge.from === id)) {
         if (!found.has(to)) {
            found.add(to)
            queue.push(to)
         }
      }
   }

   return found
}

// The graph is split into the main flow and one small workflow for each hook. A graph without hook lines comes back as it is.
export const splitHooks = (graph: Graph): HookSplit => {
   const hookLines = graph.edges.filter(isHookLine)

   if (hookLines.length === 0) {
      return {
         main: graph,
         attachments: [],
         chainNodeIds: new Set(),
         problems: [],
      }
   }

   const ordinary = graph.edges.filter(edge => !isHookLine(edge))
   const byId = new Map(graph.nodes.map(node => [node.id, node]))
   const chainNodeIds = reachable(
      ordinary,
      hookLines.map(({ to }) => to)
   )
   const problems: GraphError[] = []
   const label = (id: string) => byId.get(id)?.label ?? id

   for (const line of hookLines) {
      if (chainNodeIds.has(line.from)) {
         problems.push({
            nodeId: line.from,
            level: 'error',
            message: 'A block inside a hook cannot have hooks of its own.',
         })
      }
   }

   for (const edge of ordinary) {
      if (chainNodeIds.has(edge.to) && !chainNodeIds.has(edge.from)) {
         problems.push({
            nodeId: edge.to,
            level: 'error',
            message: `${label(edge.to)} is in a hook and also connected to the main flow. A hook stands apart from the main flow.`,
         })
      }
   }

   const grouped = new Map<string, { host: string; phase: HookPort; roots: string[] }>()

   for (const line of hookLines) {
      const phase = line.fromPort as HookPort
      const key = `${line.from}:${phase}`
      const known = grouped.get(key)

      grouped.set(key, {
         host: line.from,
         phase,
         roots: [...(known?.roots ?? []), line.to],
      })
   }

   const attachments = [...grouped.values()].flatMap(({ host, phase, roots }): HookAttachment[] => {
      const hostNode = byId.get(host)

      if (!hostNode) {
         return []
      }

      const reached = reachable(ordinary, roots)
      const start: GraphNode = {
         id: HOOK_START_ID,
         type: 'trigger.hook',
         config: {},
         position: {
            x: 0,
            y: 0,
         },
      }

      return [
         {
            host,
            phase,
            options: hookOptionsOf(hostNode.hooks?.[phase]),
            graph: {
               nodes: [start, ...graph.nodes.filter(({ id }) => reached.has(id))],
               edges: [
                  ...roots.map(to => ({
                     from: HOOK_START_ID,
                     to,
                  })),
                  ...ordinary.filter(({ from }) => reached.has(from)),
               ],
               ...(graph.loopRounds !== undefined && { loopRounds: graph.loopRounds }),
            },
         },
      ]
   })

   return {
      main: {
         nodes: graph.nodes.filter(({ id }) => !chainNodeIds.has(id)),
         edges: ordinary.filter(({ from, to }) => !chainNodeIds.has(from) && !chainNodeIds.has(to)),
         ...(graph.loopRounds !== undefined && { loopRounds: graph.loopRounds }),
      },
      attachments,
      chainNodeIds,
      problems,
   }
}
