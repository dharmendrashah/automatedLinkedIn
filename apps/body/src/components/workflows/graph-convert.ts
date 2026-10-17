import { type Edge, type Node } from '@xyflow/react'

import { describeSchedule } from './schedule-text'
import { type Block, type ConfigValue, type Graph, type GraphNode, type StepRun } from './types'

// Turns the saved graph into React Flow nodes and edges and back. The graph is the source of truth; the canvas only
// draws it.

export type BlockData = {
   block: Block
   config: GraphNode['config']
   step: StepRun | null
   // An error stops a run; a note only explains.
   invalid: boolean
   noted: boolean
   icpName?: string
}

export type FlowNode = Node<BlockData, 'block'>

export const SIDES = ['top', 'right', 'bottom', 'left'] as const

export type Side = (typeof SIDES)[number]

const sideOf = (handle: string | null | undefined): Side | undefined => SIDES.find(side => side === handle)

const KIND_WORDS = {
   start: 'start',
   post: 'posts',
   profile: 'people',
   company: 'companies',
} as const

export const blockOf = (catalog: Block[], type: string) => catalog.find(block => block.type === type)

// The blocks the picker offers: anything can follow a block except a trigger; then those matching the search.
export const choicesFor = (catalog: Block[], after: Block | null, query: string) => {
   const words = query.trim().toLowerCase()

   return catalog.filter(
      block =>
         (!after || block.input !== null) &&
         (!words || `${block.label} ${block.summary}`.toLowerCase().includes(words))
   )
}

const STATUS_ORDER = ['FAILED', 'RUNNING', 'WAITING', 'PARTIAL', 'DONE'] as const

// A block that ran in several rounds shows them added up, with the most telling state.
export const combineRounds = (steps: StepRun[]) => {
   const byNode = new Map<string, StepRun>()

   for (const step of steps) {
      const known = byNode.get(step.nodeId)

      byNode.set(
         step.nodeId,
         known
            ? {
                 ...known,
                 status: STATUS_ORDER.find(status => status === known.status || status === step.status) ?? step.status,
                 itemsIn: known.itemsIn + step.itemsIn,
                 itemsOut: known.itemsOut + step.itemsOut,
                 costMicros: known.costMicros + step.costMicros,
                 round: Math.max(known.round, step.round),
                 message: step.message ?? known.message,
              }
            : step
      )
   }

   return byNode
}

export const toFlow = (
   graph: Graph,
   catalog: Block[],
   extras: { steps?: StepRun[]; invalid?: Set<string>; noted?: Set<string>; icpNames?: Map<string, string> } = {}
): { nodes: FlowNode[]; edges: Edge[] } => {
   const stepOf = combineRounds(extras.steps ?? [])
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
                    noted: extras.noted?.has(node.id) ?? false,
                    icpName: extras.icpNames?.get(String(node.config.icpId ?? '')),
                 },
              },
           ]
         : []
   })
   const edges = graph.edges.map(({ from, to, fromSide, toSide }) => {
      const source = stepOf.get(from)
      const kind = blockOf(catalog, graph.nodes.find(({ id }) => id === from)?.type ?? '')?.output

      return {
         id: `${from}>${to}`,
         source: from,
         target: to,
         sourceHandle: fromSide ?? 'bottom',
         targetHandle: toSide ?? 'top',
         animated: source?.status === 'RUNNING',
         label: source && kind ? `${source.itemsOut} ${KIND_WORDS[kind]}` : undefined,
      }
   })

   return {
      nodes,
      edges,
   }
}

export const toGraph = (nodes: FlowNode[], edges: Edge[], loopRounds?: number): Graph => ({
   nodes: nodes.map(node => ({
      id: node.id,
      type: node.data.block.type,
      config: node.data.config,
      position: {
         x: Math.round(node.position.x),
         y: Math.round(node.position.y),
      },
   })),
   edges: edges.map(({ source, target, sourceHandle, targetHandle }) => ({
      from: source,
      to: target,
      fromSide: sideOf(sourceHandle),
      toSide: sideOf(targetHandle),
   })),
   ...(loopRounds === undefined ? {} : { loopRounds }),
})

// Any block joins any other once; a block never joins itself. What a block cannot use passes through it.
export const canConnect = (edges: Edge[], source: string | null, target: string | null) =>
   Boolean(source && target && source !== target && !edges.some(edge => edge.source === source && edge.target === target))

// The same limits the server keeps on how often a loop runs.
export const DEFAULT_LOOP_ROUNDS = 3
export const MAX_LOOP_ROUNDS = 10

// True when some line leads back to a block already on the way.
export const hasLoop = (edges: Pick<Edge, 'source' | 'target'>[]) => {
   const state = new Map<string, 'open' | 'done'>()
   const visit = (id: string): boolean => {
      state.set(id, 'open')

      const looped = edges
         .filter(({ source }) => source === id)
         .some(({ target }) => state.get(target) === 'open' || (!state.has(target) && visit(target)))

      state.set(id, 'done')

      return looped
   }

   return edges.some(({ source }) => !state.has(source) && visit(source))
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

// What a block's "how many" counts.
const UNITS: Partial<Record<Block['type'], string>> = {
   'input.posts': 'posts',
   'input.profiles': 'people',
   'input.companies': 'companies',
   'collect.findPosts': 'posts',
   'collect.searchPeople': 'people',
   'collect.domainLookup': 'companies',
   'collect.commenters': 'per post',
   'collect.reactors': 'per post',
   'collect.postsOfPeople': 'posts per person',
   'collect.engagedPosts': 'per person',
   'collect.postsOfCompanies': 'posts per company',
   'collect.employees': 'per company',
   'collect.jobs': 'jobs per 10 companies',
}

const MERGE_MODES: Record<string, string> = {
   all: 'Everything, each once',
   every: 'Only what every line has',
   onlyMain: 'Only what the main line alone has',
}

// One line under the block's title that says what it is set to.
export const summaryOf = (block: Block, config: GraphNode['config'], icpName?: string) => {
   const values = { ...block.defaults, ...config }

   if (block.type === 'score.icp') {
      return icpName ? `Against "${icpName}"` : 'Pick an ideal customer'
   }

   if (block.type === 'process.merge') {
      return MERGE_MODES[show(values.mode)] ?? block.summary
   }

   if ('howMany' in values) {
      const unit = UNITS[block.type] ?? ''

      return values.all === true ? `All ${unit}`.trim() : `Up to ${show(values.howMany)} ${unit}`.trim()
   }

   if (block.type === 'trigger.schedule') {
      return describeSchedule(values)
   }

   return block.summary
}
