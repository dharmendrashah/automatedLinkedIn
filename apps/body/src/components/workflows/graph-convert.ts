import { type Edge, type Node } from '@xyflow/react'

import { type Block, type ConfigValue, type Graph, type GraphNode, type StepRun } from './types'

// Turns the saved graph into React Flow nodes and edges and back. The graph is the source of truth; the canvas only
// draws it.

export type BlockData = {
   block: Block
   config: GraphNode['config']
   step: StepRun | null
   invalid: boolean
   icpName?: string
}

export type FlowNode = Node<BlockData, 'block'>

const KIND_WORDS = {
   start: 'start',
   post: 'posts',
   profile: 'people',
   company: 'companies',
} as const

export const blockOf = (catalog: Block[], type: string) => catalog.find(block => block.type === type)

// The blocks the picker offers: after a block, only those that take what it gives; then those matching the search.
export const choicesFor = (catalog: Block[], after: Block | null, query: string) => {
   const words = query.trim().toLowerCase()

   return catalog.filter(
      block =>
         (!after || (after.output !== null && block.input === after.output)) &&
         (!words || `${block.label} ${block.summary}`.toLowerCase().includes(words))
   )
}

export const toFlow = (
   graph: Graph,
   catalog: Block[],
   extras: { steps?: StepRun[]; invalid?: Set<string>; icpNames?: Map<string, string> } = {}
): { nodes: FlowNode[]; edges: Edge[] } => {
   const stepOf = new Map((extras.steps ?? []).map(step => [step.nodeId, step]))
   const nodes = graph.nodes.flatMap(node => {
      const block = blockOf(catalog, node.type)

      return block
         ? [
              {
                 id: node.id,
                 type: 'block' as const,
                 position: node.position,
                 data: {
                    block,
                    config: node.config,
                    step: stepOf.get(node.id) ?? null,
                    invalid: extras.invalid?.has(node.id) ?? false,
                    icpName: extras.icpNames?.get(String(node.config.icpId ?? '')),
                 },
              },
           ]
         : []
   })
   const edges = graph.edges.map(({ from, to }) => {
      const source = stepOf.get(from)
      const kind = blockOf(catalog, graph.nodes.find(({ id }) => id === from)?.type ?? '')?.output

      return {
         id: `${from}>${to}`,
         source: from,
         target: to,
         animated: source?.status === 'RUNNING',
         label: source && kind ? `${source.itemsOut} ${KIND_WORDS[kind]}` : undefined,
      }
   })

   return {
      nodes,
      edges,
   }
}

export const toGraph = (nodes: FlowNode[], edges: Edge[]): Graph => ({
   nodes: nodes.map(node => ({
      id: node.id,
      type: node.data.block.type,
      config: node.data.config,
      position: {
         x: Math.round(node.position.x),
         y: Math.round(node.position.y),
      },
   })),
   edges: edges.map(({ source, target }) => ({
      from: source,
      to: target,
   })),
})

// Only ports that carry the same kind of item join: posts to posts, people to people.
export const canConnect = (nodes: FlowNode[], edges: Edge[], source: string | null, target: string | null) => {
   const from = nodes.find(({ id }) => id === source)?.data.block
   const to = nodes.find(({ id }) => id === target)?.data.block

   return Boolean(
      from &&
         to &&
         source !== target &&
         from.output !== null &&
         from.output === to.input &&
         !edges.some(edge => edge.source === source && edge.target === target)
   )
}

export const newNodeId = (type: string, nodes: { id: string }[]) => {
   const base = type.split('.')[1] ?? 'block'
   let index = 1

   while (nodes.some(({ id }) => id === `${base}-${index}`)) {
      index += 1
   }

   return `${base}-${index}`
}

const show = (value: ConfigValue | undefined) => (Array.isArray(value) ? value.join(', ') : String(value ?? ''))

// One line under the block's title that says what it is set to.
export const summaryOf = (block: Block, config: GraphNode['config'], icpName?: string) => {
   const values = { ...block.defaults, ...config }

   if (block.type === 'score.icp') {
      return icpName ? `Against "${icpName}"` : 'Pick an ideal customer'
   }

   if ('howMany' in values) {
      return `Up to ${show(values.howMany)}${block.type === 'input.posts' ? ' posts' : ' per post'}`
   }

   if (block.type === 'trigger.schedule') {
      return values.every === 'hours' ? `Every ${show(values.hours)} hours` : `${values.every === 'week' ? 'Weekly' : 'Daily'} at ${show(values.at)} (${show(values.timeZone)})`
   }

   return block.summary
}
