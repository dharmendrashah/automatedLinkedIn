import { z } from 'zod'

// The closed catalog of workflow blocks, the graph they form, and the pure rules on it (.plan/gtm-workflows.md).
// Ids and labels are neutral: no data supplier is named here, because the browser shows these.

export type ItemKind = 'start' | 'post' | 'profile'

export const KIND_LABELS: Record<ItemKind, string> = {
   start: 'a start',
   post: 'posts',
   profile: 'people',
}

// Per row, in millionths of a dollar.
export const PRICE_MICROS = {
   engagement: 2_000,
   profile: 4_000,
} as const

export type Field =
   | { key: string; label: string; kind: 'int'; min: number; max: number; hint?: string }
   | { key: string; label: string; kind: 'words'; hint?: string }
   | { key: string; label: string; kind: 'icp' }
   | { key: string; label: string; kind: 'time' }
   | { key: string; label: string; kind: 'text' }
   | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }

const howMany = (max: number, fallback: number) => z.number().int().min(1).max(max).default(fallback)

const words = z.array(z.string().trim().toLowerCase().min(1).max(100)).max(50).default([])

const empty = z.object({})

const isTimeZone = (value: string) => {
   try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format()

      return true
   } catch {
      return false
   }
}

const scheduleSchema = z.object({
   every: z.enum(['hours', 'day', 'week']).default('day'),
   hours: z.number().int().min(1).max(24).default(24),
   at: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('09:00'),
   weekday: z.number().int().min(0).max(6).default(1),
   timeZone: z.string().trim().min(1).max(64).refine(isTimeZone, 'is not a known time zone').default('UTC'),
})

export type Schedule = z.infer<typeof scheduleSchema>

export const BLOCK_TYPES = [
   'trigger.manual',
   'trigger.schedule',
   'input.posts',
   'collect.commenters',
   'collect.reactors',
   'process.dedupe',
   'process.filter',
   'score.icp',
   'collect.profile',
   'output.list',
   'output.markPosts',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

type BlockSpec = {
   group: 'Triggers' | 'Inputs' | 'Collect' | 'Process' | 'Output'
   label: string
   summary: string
   input: ItemKind | null
   output: ItemKind | null
   config: z.ZodType<Record<string, unknown>>
   fields: Field[]
}

const BLOCKS = {
   'trigger.manual': {
      group: 'Triggers',
      label: 'Run by hand',
      summary: 'Starts when you press Run.',
      input: null,
      output: 'start',
      config: empty,
      fields: [],
   },
   'trigger.schedule': {
      group: 'Triggers',
      label: 'On a schedule',
      summary: 'Starts every few hours, every day or every week.',
      input: null,
      output: 'start',
      config: scheduleSchema,
      fields: [
         {
            key: 'every',
            label: 'Runs',
            kind: 'select',
            options: [
               {
                  value: 'hours',
                  label: 'Every few hours',
               },
               {
                  value: 'day',
                  label: 'Every day',
               },
               {
                  value: 'week',
                  label: 'Every week',
               },
            ],
         },
         {
            key: 'hours',
            label: 'Hours between runs',
            kind: 'int',
            min: 1,
            max: 24,
         },
         {
            key: 'at',
            label: 'At (24 hour clock)',
            kind: 'time',
         },
         {
            key: 'weekday',
            label: 'Day of the week',
            kind: 'select',
            options: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
               (label, day) => ({
                  value: String(day),
                  label,
               })
            ),
         },
         {
            key: 'timeZone',
            label: 'Time zone',
            kind: 'text',
         },
      ],
   },
   'input.posts': {
      group: 'Inputs',
      label: 'Posts',
      summary: 'Takes posts from your posts list that are not done yet.',
      input: 'start',
      output: 'post',
      config: z.object({ howMany: howMany(50, 5) }),
      fields: [
         {
            key: 'howMany',
            label: 'How many posts',
            kind: 'int',
            min: 1,
            max: 50,
         },
      ],
   },
   'collect.commenters': {
      group: 'Collect',
      label: 'Get commenters',
      summary: 'The people who commented on each post.',
      input: 'post',
      output: 'profile',
      config: z.object({ howMany: howMany(500, 50) }),
      fields: [
         {
            key: 'howMany',
            label: 'How many comments per post',
            kind: 'int',
            min: 1,
            max: 500,
         },
      ],
   },
   'collect.reactors': {
      group: 'Collect',
      label: 'Get reactors',
      summary: 'The people who reacted to each post.',
      input: 'post',
      output: 'profile',
      config: z.object({ howMany: howMany(500, 50) }),
      fields: [
         {
            key: 'howMany',
            label: 'How many reactions per post',
            kind: 'int',
            min: 1,
            max: 500,
         },
      ],
   },
   'process.dedupe': {
      group: 'Process',
      label: 'Remove duplicates',
      summary: 'Keeps each person once and drops people you already have or must not contact.',
      input: 'profile',
      output: 'profile',
      config: empty,
      fields: [],
   },
   'process.filter': {
      group: 'Process',
      label: 'Filter',
      summary: 'Keeps people who meet simple rules.',
      input: 'profile',
      output: 'profile',
      config: z.object({
         minFollowers: z.number().int().min(0).max(10_000_000).default(0),
         signal: z.enum(['any', 'commented']).default('any'),
         headlineWords: words,
      }),
      fields: [
         {
            key: 'minFollowers',
            label: 'At least this many followers',
            kind: 'int',
            min: 0,
            max: 10_000_000,
            hint: 'Only commenters carry a follower count; 0 keeps everyone.',
         },
         {
            key: 'signal',
            label: 'Keep',
            kind: 'select',
            options: [
               {
                  value: 'any',
                  label: 'Commenters and reactors',
               },
               {
                  value: 'commented',
                  label: 'Only people who commented',
               },
            ],
         },
         {
            key: 'headlineWords',
            label: 'Headline has one of these words',
            kind: 'words',
            hint: 'Separate with commas. Empty keeps everyone.',
         },
      ],
   },
   'score.icp': {
      group: 'Process',
      label: 'Score against an ideal customer',
      summary: 'Scores each person and keeps the qualified and maybe ones.',
      input: 'profile',
      output: 'profile',
      config: z.object({ icpId: z.string().min(1) }),
      fields: [
         {
            key: 'icpId',
            label: 'Ideal customer',
            kind: 'icp',
         },
      ],
   },
   'collect.profile': {
      group: 'Collect',
      label: 'Get full profile',
      summary: 'Reads the full profile of qualified people and scores them again.',
      input: 'profile',
      output: 'profile',
      config: empty,
      fields: [],
   },
   'output.list': {
      group: 'Output',
      label: 'Add to list',
      summary: "Adds people to the workflow's list as qualified or maybe.",
      input: 'profile',
      output: null,
      config: empty,
      fields: [],
   },
   'output.markPosts': {
      group: 'Output',
      label: 'Mark posts done',
      summary: 'Marks the posts as done when everything else has finished.',
      input: 'post',
      output: null,
      config: empty,
      fields: [],
   },
} as const satisfies Record<BlockType, BlockSpec>

export const blockOf = (type: BlockType): BlockSpec => BLOCKS[type]

// The catalog as plain data, for the browser's palette and settings forms.
export const catalog = (): CatalogBlock[] =>
   BLOCK_TYPES.map(type => {
      const { group, label, summary, input, output, fields, config } = BLOCKS[type]

      return {
         type,
         group,
         label,
         summary,
         input,
         output,
         fields,
         // Empty when a setting has no default, such as the ideal customer to score against.
         defaults: configSchema.safeParse(config.safeParse({}).data ?? {}).data ?? {},
      }
   })

const nodeId = z.string().regex(/^[\w-]{1,40}$/)

// Plain values only, so a graph is stored as JSON as it is.
const configSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))

export type NodeConfig = z.infer<typeof configSchema>

export type CatalogBlock = {
   type: BlockType
   group: BlockSpec['group']
   label: string
   summary: string
   input: ItemKind | null
   output: ItemKind | null
   fields: Field[]
   defaults: NodeConfig
}

export const graphSchema = z.object({
   nodes: z
      .array(
         z.object({
            id: nodeId,
            type: z.enum(BLOCK_TYPES),
            config: configSchema.default({}),
            position: z.object({
               x: z.number(),
               y: z.number(),
            }),
         })
      )
      .max(30),
   edges: z
      .array(
         z.object({
            from: nodeId,
            to: nodeId,
         })
      )
      .max(60),
})

export type Graph = z.infer<typeof graphSchema>
export type GraphNode = Graph['nodes'][number]
export type GraphError = { nodeId?: string; message: string }

const isTrigger = (type: BlockType) => BLOCKS[type].input === null

const parentsOf = (graph: Graph, id: string) => graph.edges.filter(edge => edge.to === id).map(edge => edge.from)

// Kahn's order; nodes on a loop are left out, which is how a loop is detected.
export const topoOrder = (graph: Graph) => {
   const incoming = new Map(graph.nodes.map(node => [node.id, parentsOf(graph, node.id).length]))
   const ready = graph.nodes.filter(node => incoming.get(node.id) === 0).map(node => node.id)
   const order: string[] = []

   while (ready.length > 0) {
      const id = ready.shift() ?? ''

      order.push(id)

      for (const edge of graph.edges.filter(({ from }) => from === id)) {
         const left = (incoming.get(edge.to) ?? 0) - 1

         incoming.set(edge.to, left)

         if (left === 0) {
            ready.push(edge.to)
         }
      }
   }

   return order
}

const ancestorsOf = (graph: Graph, id: string, seen = new Set<string>()) => {
   for (const parent of parentsOf(graph, id)) {
      if (!seen.has(parent)) {
         seen.add(parent)
         ancestorsOf(graph, parent, seen)
      }
   }

   return seen
}

const configErrors = (node: GraphNode): GraphError[] => {
   const result = BLOCKS[node.type].config.safeParse(node.config)

   return result.success
      ? []
      : result.error.issues.map(issue => ({
           nodeId: node.id,
           message: `${BLOCKS[node.type].label}: ${issue.path.join('.') || 'settings'} ${issue.message.toLowerCase()}`,
        }))
}

const edgeErrors = (graph: Graph, byId: Map<string, GraphNode>): GraphError[] =>
   graph.edges.flatMap(({ from, to }) => {
      const source = byId.get(from)
      const target = byId.get(to)

      if (!source || !target || from === to) {
         return [{ message: 'A connection points at a block that does not exist.' }]
      }

      const gives = BLOCKS[source.type].output
      const needs = BLOCKS[target.type].input

      if (gives === null || needs === null || gives !== needs) {
         return [
            {
               nodeId: to,
               message: `${BLOCKS[source.type].label} gives ${gives ? KIND_LABELS[gives] : 'nothing'}, but ${BLOCKS[target.type].label} needs ${needs ? KIND_LABELS[needs] : 'no input'}.`,
            },
         ]
      }

      return []
   })

// Everything a workflow needs before it may run. Empty means ready.
export const validateGraph = (graph: Graph): GraphError[] => {
   const byId = new Map(graph.nodes.map(node => [node.id, node]))
   const errors: GraphError[] = []

   if (byId.size !== graph.nodes.length) {
      errors.push({ message: 'Two blocks share the same id.' })
   }

   const keys = new Set(graph.edges.map(({ from, to }) => `${from}>${to}`))

   if (keys.size !== graph.edges.length) {
      errors.push({ message: 'Two blocks are connected twice.' })
   }

   errors.push(...graph.nodes.flatMap(configErrors), ...edgeErrors(graph, byId))

   const triggers = graph.nodes.filter(node => isTrigger(node.type))

   if (triggers.length !== 1) {
      errors.push({ message: 'A workflow needs exactly one trigger.' })
   }

   for (const node of graph.nodes) {
      if (!isTrigger(node.type) && parentsOf(graph, node.id).length === 0) {
         errors.push({
            nodeId: node.id,
            message: `${BLOCKS[node.type].label} is not connected to anything before it.`,
         })
      }
   }

   if (topoOrder(graph).length !== graph.nodes.length) {
      errors.push({ message: 'The blocks form a loop. A workflow must flow one way.' })

      return errors
   }

   const lists = graph.nodes.filter(node => node.type === 'output.list')

   if (lists.length === 0) {
      errors.push({ message: 'Add an "Add to list" block so the people found are kept.' })
   }

   for (const list of lists) {
      const before = ancestorsOf(graph, list.id)

      if (![...before].some(id => byId.get(id)?.type === 'score.icp')) {
         errors.push({
            nodeId: list.id,
            message: 'Add to list needs a "Score against an ideal customer" block before it.',
         })
      }
   }

   return errors
}

export type Estimate = {
   totalMicros: number
   nodes: Record<string, { items: number; costMicros: number }>
}

// The block's own schema fills defaults, so a node saved without settings still has its "how many".
const howManyOf = (node: GraphNode) => {
   const { howMany } = blockOf(node.type).config.parse(node.config)

   return typeof howMany === 'number' ? howMany : 0
}

// The most a run can cost: every "how many" is reached and nobody is filtered out. `posts` is how many posts are
// waiting in the posts list.
export const estimateGraph = (graph: Graph, available: { posts: number }): Estimate => {
   const byId = new Map(graph.nodes.map(node => [node.id, node]))
   const nodes: Estimate['nodes'] = {}

   for (const id of topoOrder(graph)) {
      const node = byId.get(id)

      if (!node) continue

      const incoming = parentsOf(graph, id).reduce((sum, parent) => sum + (nodes[parent]?.items ?? 0), 0)
      let items = incoming
      let costMicros = 0

      if (node.type === 'input.posts') {
         items = Math.min(howManyOf(node), available.posts)
      } else if (node.type === 'collect.commenters' || node.type === 'collect.reactors') {
         items = incoming * howManyOf(node)
         costMicros = items * PRICE_MICROS.engagement
      } else if (node.type === 'collect.profile') {
         costMicros = incoming * PRICE_MICROS.profile
      } else if (isTrigger(node.type)) {
         items = 0
      }

      nodes[id] = {
         items,
         costMicros,
      }
   }

   return {
      totalMicros: Object.values(nodes).reduce((sum, { costMicros }) => sum + costMicros, 0),
      nodes,
   }
}

export const PREVIEW_LIMITS = {
   posts: 1,
   perPost: 20,
} as const

// The same workflow on a small sample: one post and at most 20 people per collect block.
export const previewGraph = (graph: Graph): Graph => ({
   ...graph,
   nodes: graph.nodes.map(node => {
      if (node.type === 'input.posts') {
         return {
            ...node,
            config: { howMany: PREVIEW_LIMITS.posts },
         }
      }

      if (node.type === 'collect.commenters' || node.type === 'collect.reactors') {
         return {
            ...node,
            config: { howMany: Math.min(howManyOf(node), PREVIEW_LIMITS.perPost) },
         }
      }

      return node
   }),
})

// Template 1: posts you chose, their commenters and reactors, scored, the qualified enriched, kept in a list.
export const flagshipGraph = (options: { icpId: string; posts: number; perPost: number }): Graph => {
   const node = (id: string, type: BlockType, x: number, y: number, config: GraphNode['config'] = {}): GraphNode => ({
      id,
      type,
      config,
      position: {
         x,
         y,
      },
   })

   return {
      nodes: [
         node('trigger', 'trigger.manual', 0, 120),
         node('posts', 'input.posts', 240, 120, { howMany: options.posts }),
         node('commenters', 'collect.commenters', 480, 40, { howMany: options.perPost }),
         node('reactors', 'collect.reactors', 480, 200, { howMany: options.perPost }),
         node('dedupe', 'process.dedupe', 720, 120),
         node('score', 'score.icp', 960, 120, { icpId: options.icpId }),
         node('enrich', 'collect.profile', 1200, 120),
         node('list', 'output.list', 1440, 120),
         node('done', 'output.markPosts', 480, 360),
      ],
      edges: [
         ['trigger', 'posts'],
         ['posts', 'commenters'],
         ['posts', 'reactors'],
         ['posts', 'done'],
         ['commenters', 'dedupe'],
         ['reactors', 'dedupe'],
         ['dedupe', 'score'],
         ['score', 'enrich'],
         ['enrich', 'list'],
      ].map(([from, to]) => ({
         from,
         to,
      })),
   }
}

// The schedule of a graph, or null when it is started by hand.
export const scheduleOf = (graph: Graph): Schedule | null => {
   const node = graph.nodes.find(({ type }) => type === 'trigger.schedule')

   return node ? scheduleSchema.parse(node.config) : null
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const wallClock = (date: Date, timeZone: string) => {
   const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
   }).formatToParts(date)
   const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value ?? 0)

   return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
}

// The instant a wall-clock time happens in a time zone. Checked twice, so a time next to a clock change lands right.
const zonedToUtc = (wall: number, timeZone: string) => {
   const first = wall - (wallClock(new Date(wall), timeZone) - wall)

   return new Date(wall - (wallClock(new Date(first), timeZone) - first))
}

// The first start of the schedule strictly after `after`.
export const nextScheduledRun = (schedule: Schedule, after: Date): Date => {
   if (schedule.every === 'hours') {
      return new Date(after.getTime() + schedule.hours * 3_600_000)
   }

   const [hour, minute] = schedule.at.split(':').map(Number)
   const today = new Date(wallClock(after, schedule.timeZone))

   for (let offset = 0; offset <= 8; offset += 1) {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset))
      const candidate = zonedToUtc(
         Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute),
         schedule.timeZone
      )
      const rightDay = schedule.every === 'day' || WEEKDAYS[day.getUTCDay()] === WEEKDAYS[schedule.weekday]

      if (rightDay && candidate > after) {
         return candidate
      }
   }

   return new Date(after.getTime() + 7 * 24 * 3_600_000)
}
