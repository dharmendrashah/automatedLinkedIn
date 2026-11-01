import { type Edge, type Node } from '@xyflow/react'

import { type Block, type ConfigValue, type Graph, type GraphNode, type StepRun } from './types'

import { readPostBlocks } from '../posting/post-config'
import { joinedText } from '../posting/rules'
import { summaryOf as postSummaryOf } from '../posting/summary'
import { restrictionText } from '../posting/visibility'
import { browserTimeZone, describeSchedule } from './schedule-text'

// Turns the saved graph into React Flow nodes and edges and back. The graph is the source of truth; the canvas only
// draws it.

export type BlockData = {
   block: Block
   config: GraphNode['config']
   // The version of the block the settings were saved for; sent back on save so they are not upgraded again.
   version?: number
   step: StepRun | null
   // An error stops a run; a note only explains.
   invalid: boolean
   noted: boolean
   // Switched off: it passes everything on without running.
   disabled?: boolean
   // Shown with a run that does not have this block: it was added after the run started.
   faded: boolean
   icpName?: string
}

export type FlowNode = Node<BlockData, 'block'>

export const SIDES = ['top', 'right', 'bottom', 'left'] as const

export type Side = (typeof SIDES)[number]

export const OPPOSITE: Record<Side, Side> = {
   top: 'bottom',
   bottom: 'top',
   left: 'right',
   right: 'left',
}

const sideOf = (handle: string | null | undefined): Side | undefined => SIDES.find(side => side === handle)

// A block's other outputs have their own handle, named `port:<output>`; the four sides are the main output.
const PORT_HANDLE = 'port:'

export const handleOfPort = (port: string) => `${PORT_HANDLE}${port}`

export const portOfHandle = (handle: string | null | undefined) =>
   handle?.startsWith(PORT_HANDLE) ? handle.slice(PORT_HANDLE.length) : undefined

const KIND_WORDS = {
   start: 'start',
   post: 'posts',
   profile: 'people',
   company: 'companies',
} as const

export const blockOf = (catalog: Block[], type: string) => catalog.find(block => block.type === type)

// The blocks the picker offers: anything can follow a block except a trigger, and only a block that gives something can
// come before one; then those matching the search. A retired block is not offered.
export const choicesFor = (catalog: Block[], anchor: Block | null, query: string, before = false) => {
   const words = query.trim().toLowerCase()

   return catalog.filter(
      block =>
         !block.deprecated &&
         (!anchor || (before ? block.output !== null : block.input !== null)) &&
         (!words || `${block.label} ${block.summary}`.toLowerCase().includes(words))
   )
}

const STATUS_ORDER = ['FAILED', 'RUNNING', 'WAITING', 'PARTIAL', 'DONE', 'SKIPPED'] as const

type Progress = NonNullable<StepRun['progress']>

const addProgress = (a: Progress | null, b: Progress | null): Progress | null =>
   a && b
      ? {
           requests: a.requests + b.requests,
           done: a.done + b.done,
           failed: a.failed + b.failed,
           uncharged: a.uncharged + b.uncharged,
           retrying: a.retrying + b.retrying,
           nextRetryAt: [a.nextRetryAt, b.nextRetryAt].filter((at): at is string => Boolean(at)).sort()[0] ?? null,
        }
      : (a ?? b)

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
                 errorCode: step.errorCode ?? known.errorCode,
                 waitUntil: step.waitUntil ?? known.waitUntil,
                 tries: Math.max(known.tries, step.tries),
                 progress: addProgress(known.progress, step.progress),
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
                    version: node.version,
                    disabled: node.disabled,
                    step: stepOf.get(node.id) ?? null,
                    invalid: extras.invalid?.has(node.id) ?? false,
                    noted: extras.noted?.has(node.id) ?? false,
                    faded: stepOf.size > 0 && !stepOf.has(node.id),
                    icpName: extras.icpNames?.get(String(node.config.icpId ?? '')),
                 },
              },
           ]
         : []
   })
   const edges = graph.edges.map(({ from, to, fromSide, toSide, fromPort }) => {
      const source = stepOf.get(from)
      const kind = blockOf(catalog, graph.nodes.find(({ id }) => id === from)?.type ?? '')?.output

      return {
         id: `${from}>${to}`,
         source: from,
         target: to,
         sourceHandle: fromPort && fromPort !== 'main' ? handleOfPort(fromPort) : (fromSide ?? 'bottom'),
         targetHandle: toSide ?? 'top',
         animated: source?.status === 'RUNNING',
         label: fromPort && fromPort !== 'main' ? 'Else' : source && kind ? `${source.itemsOut} ${KIND_WORDS[kind]}` : undefined,
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
      ...(node.data.version === undefined ? {} : { version: node.data.version }),
      ...(node.data.disabled ? { disabled: true } : {}),
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
      ...(portOfHandle(sourceHandle) === undefined ? {} : { fromPort: portOfHandle(sourceHandle) }),
   })),
   ...(loopRounds === undefined ? {} : { loopRounds }),
})

// Any block joins any other once; a block never joins itself. What a block cannot use passes through it.
export const canConnect = (edges: Edge[], source: string | null, target: string | null) =>
   Boolean(
      source && target && source !== target && !edges.some(edge => edge.source === source && edge.target === target)
   )

// The same limits the server keeps on how often a loop runs. Importing them from contracts would add the whole package
// (22 kB gzipped, measured 2026-11-02) to the main chunk, so they are kept here.
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

// What a new block starts with: a schedule and "added today" use the owner's time zone, input blocks take all that match,
// and profiles and companies take only new ones. Blocks saved before keep their number and every status.
export const startConfig = (type: string, timeZone: string = browserTimeZone()): GraphNode['config'] => {
   if (type === 'input.profiles' || type === 'input.companies') {
      return {
         timeZone,
         all: true,
         statuses: ['NEW'],
      }
   }

   if (type === 'input.posts') {
      return {
         timeZone,
         all: true,
      }
   }

   return type === 'trigger.schedule' ? { timeZone } : {}
}

const show = (value: ConfigValue | undefined) => (Array.isArray(value) ? value.join(', ') : String(value ?? ''))

const MERGE_MODES: Record<string, string> = {
   all: 'Everything, each once',
   every: 'Only what every line has',
   onlyMain: 'Only what the main line alone has',
}

const RUN_WAITS: Record<string, string> = {
   none: 'Starts it and goes on',
   status: 'Waits for a yes or no',
   results: 'Waits for the people it saves',
}

// The one and the many word of each unit of a Wait block.
const WAIT_UNIT_WORDS: Record<string, [string, string]> = {
   seconds: ['second', 'seconds'],
   minutes: ['minute', 'minutes'],
   hours: ['hour', 'hours'],
   days: ['day', 'days'],
   weeks: ['week', 'weeks'],
}

const ADDED_WORDS: Record<string, string> = {
   today: 'added today',
   week: 'added this week',
   '7d': 'added in the last 7 days',
   '30d': 'added in the last 30 days',
   lastRun: 'added since the last run',
}

const STATUS_WORDS: Record<string, string> = {
   NEW: 'new',
   CONTACTED: 'contacted',
   REPLIED: 'replied',
}

const listOf = (value: ConfigValue | undefined) => (Array.isArray(value) ? value : [])

// An input block's filters in a few words, such as "labelled fintech · added this week · new only".
const pickOf = (values: Record<string, ConfigValue | undefined>) => {
   const labels = listOf(values.labels)
   const without = listOf(values.withoutLabels)
   const statuses = listOf(values.statuses)
   const joiner = values.labelMatch === 'all' ? ' and ' : ', '

   return [
      labels.length > 0 ? `labelled ${labels.join(joiner)}` : null,
      without.length > 0 ? `not ${without.join(', ')}` : null,
      ADDED_WORDS[show(values.added)] ?? null,
      statuses.length > 0 && statuses.length < 3
         ? `${statuses.map(status => STATUS_WORDS[status] ?? status).join(' or ')} only`
         : null,
   ].filter((part): part is string => part !== null)
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

   if (block.type === 'logic.runWorkflow') {
      return RUN_WAITS[show(values.wait)] ?? block.summary
   }

   if (block.type === 'logic.wait') {
      const unit = WAIT_UNIT_WORDS[show(values.unit)] ?? WAIT_UNIT_WORDS.seconds
      const amount = (value: ConfigValue | undefined) => Number(value ?? 0)
      const words = (count: number) => (count === 1 ? unit[0] : unit[1])

      return values.mode === 'between'
         ? `Waits ${amount(values.minAmount)} to ${amount(values.maxAmount)} ${unit[1]}`
         : `Waits ${amount(values.amount)} ${words(amount(values.amount))}`
   }

   if (block.type === 'logic.retry') {
      const times = Number(values.times ?? 0)
      const pause = Number(values.waitSeconds ?? 0)
      const tries = times === 1 ? 'Tries once more' : `Tries up to ${times} more times`

      return pause > 0 ? `${tries}, after ${pause} seconds` : tries
   }

   if (block.type === 'account.select') {
      const accounts = listOf(values.accounts).length

      return accounts === 0
         ? 'Pick the accounts to use'
         : accounts === 1
           ? 'Uses 1 account'
           : `Takes turns across ${accounts} accounts`
   }

   if (block.type === 'account.writePost') {
      const blocks = readPostBlocks(values.post)
      const { words, attachment } = postSummaryOf(blocks)

      if (blocks.length === 0) {
         return 'Write the post'
      }

      const posts =
         joinedText(blocks).trim() === ''
            ? `Posts only ${attachment ?? 'a file'}`
            : [`Posts “${words}”`, attachment].filter(Boolean).join(' · ')
      const only = (value: ConfigValue | undefined) => (value === 'CONNECTIONS' ? 'CONNECTIONS' : 'ANYONE')

      return [posts, restrictionText(only(values.audience), only(values.comments))].filter(Boolean).join(' · ')
   }

   if ('howMany' in values) {
      const unit = block.unit ?? ''
      const amount = values.all === true ? `All ${unit}`.trim() : `Up to ${show(values.howMany)} ${unit}`.trim()

      return [amount, ...pickOf(values)].join(' · ')
   }

   if (block.type === 'trigger.schedule') {
      return describeSchedule(values)
   }

   return block.summary
}
