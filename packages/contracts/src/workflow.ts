import { z } from 'zod'

// The closed catalog of workflow blocks, the graph they form, and the pure rules on it (.plan/gtm-workflows.md).
// Ids and labels are neutral: no data supplier is named here, because the browser shows these.

export type ItemKind = 'start' | 'post' | 'profile' | 'company'

export const KIND_LABELS: Record<ItemKind, string> = {
   start: 'a start',
   post: 'posts',
   profile: 'people',
   company: 'companies',
}

// Per row, in millionths of a dollar.
export const PRICE_MICROS = {
   engagement: 2_000,
   profile: 4_000,
   // People at a company: each profile plus a fee per page of 25.
   employeePage: 100_000,
   job: 1_000,
   lookup: 4_000,
} as const

export const EMPLOYEE_PAGE = 25

export type Field =
   | { key: string; label: string; kind: 'int'; min: number; max: number; hint?: string }
   | { key: string; label: string; kind: 'words'; hint?: string }
   | { key: string; label: string; kind: 'icp' }
   | { key: string; label: string; kind: 'time' }
   | { key: string; label: string; kind: 'text' }
   | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] }
   | { key: string; label: string; kind: 'multi'; options: { value: string; label: string }[] }
   // Another workflow of the same owner.
   | { key: string; label: string; kind: 'workflow' }

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
   'trigger.api',
   'trigger.workflow',
   'input.posts',
   'input.profiles',
   'input.companies',
   'collect.findPosts',
   'collect.postsOfPeople',
   'collect.postsOfCompanies',
   'collect.engagedPosts',
   'collect.employees',
   'collect.jobs',
   'collect.domainLookup',
   'collect.commenters',
   'collect.reactors',
   'process.dedupe',
   'process.filter',
   'process.topN',
   'process.tag',
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
   'trigger.api': {
      group: 'Triggers',
      label: 'When called by API',
      summary: 'Starts when another system calls this workflow with links.',
      input: null,
      output: 'start',
      config: empty,
      fields: [],
   },
   'trigger.workflow': {
      group: 'Triggers',
      label: 'When another workflow finishes',
      summary: 'Starts with the people another workflow kept.',
      input: null,
      output: 'profile',
      config: z.object({ workflowId: z.string().min(1) }),
      fields: [
         {
            key: 'workflowId',
            label: 'After this workflow',
            kind: 'workflow',
         },
      ],
   },
   'input.profiles': {
      group: 'Inputs',
      label: 'Profiles',
      summary: 'People from your profiles list, or the links you give.',
      input: 'start',
      output: 'profile',
      config: z.object({
         howMany: howMany(200, 25),
         links: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
      }),
      fields: [
         {
            key: 'howMany',
            label: 'How many people',
            kind: 'int',
            min: 1,
            max: 200,
         },
         {
            key: 'links',
            label: 'Only these profile links',
            kind: 'words',
            hint: 'Separate with commas. Empty takes people from your profiles list.',
         },
      ],
   },
   'input.companies': {
      group: 'Inputs',
      label: 'Companies',
      summary: 'Companies from your companies list.',
      input: 'start',
      output: 'company',
      config: z.object({ howMany: howMany(100, 10) }),
      fields: [
         {
            key: 'howMany',
            label: 'How many companies',
            kind: 'int',
            min: 1,
            max: 100,
         },
      ],
   },
   'collect.findPosts': {
      group: 'Collect',
      label: 'Find posts',
      summary: 'Finds recent posts that mention your keywords.',
      input: 'start',
      output: 'post',
      config: z.object({
         keywords: z.string().trim().min(1).max(200),
         postedWithin: z.enum(['week', 'month', '3months']).default('month'),
         howMany: howMany(100, 10),
      }),
      fields: [
         {
            key: 'keywords',
            label: 'Keywords',
            kind: 'text',
         },
         {
            key: 'postedWithin',
            label: 'Posted within',
            kind: 'select',
            options: [
               {
                  value: 'week',
                  label: 'The last week',
               },
               {
                  value: 'month',
                  label: 'The last month',
               },
               {
                  value: '3months',
                  label: 'The last 3 months',
               },
            ],
         },
         {
            key: 'howMany',
            label: 'How many posts',
            kind: 'int',
            min: 1,
            max: 100,
         },
      ],
   },
   'collect.postsOfPeople': {
      group: 'Collect',
      label: 'Posts of people',
      summary: 'The recent posts of each person.',
      input: 'profile',
      output: 'post',
      config: z.object({ howMany: howMany(50, 5) }),
      fields: [
         {
            key: 'howMany',
            label: 'How many posts per person',
            kind: 'int',
            min: 1,
            max: 50,
         },
      ],
   },
   'collect.postsOfCompanies': {
      group: 'Collect',
      label: 'Posts of companies',
      summary: 'The recent posts of each company.',
      input: 'company',
      output: 'post',
      config: z.object({ howMany: howMany(50, 5) }),
      fields: [
         {
            key: 'howMany',
            label: 'How many posts per company',
            kind: 'int',
            min: 1,
            max: 50,
         },
      ],
   },
   'collect.engagedPosts': {
      group: 'Collect',
      label: 'What this person engages with',
      summary: 'The posts each person recently commented on or reacted to.',
      input: 'profile',
      output: 'post',
      config: z.object({ howMany: howMany(50, 10) }),
      fields: [
         {
            key: 'howMany',
            label: 'How many comments and how many reactions per person',
            kind: 'int',
            min: 1,
            max: 50,
         },
      ],
   },
   'collect.employees': {
      group: 'Collect',
      label: 'Find people at a company',
      summary: 'People who work at each company, with their full profile.',
      input: 'company',
      output: 'profile',
      config: z.object({
         howMany: howMany(500, 25),
         titles: words,
         seniority: z
            .array(z.enum(['120', '200', '210', '220', '300', '310', '320']))
            .max(7)
            .default([]),
      }),
      fields: [
         {
            key: 'howMany',
            label: 'How many people per company',
            kind: 'int',
            min: 1,
            max: 500,
         },
         {
            key: 'titles',
            label: 'Current job titles',
            kind: 'words',
            hint: 'Separate with commas. Empty takes any title.',
         },
         {
            key: 'seniority',
            label: 'Seniority',
            kind: 'multi',
            options: [
               {
                  value: '320',
                  label: 'Owner or partner',
               },
               {
                  value: '310',
                  label: 'C-level',
               },
               {
                  value: '300',
                  label: 'VP',
               },
               {
                  value: '220',
                  label: 'Director',
               },
               {
                  value: '210',
                  label: 'Experienced manager',
               },
               {
                  value: '200',
                  label: 'Manager',
               },
               {
                  value: '120',
                  label: 'Senior',
               },
            ],
         },
      ],
   },
   'collect.jobs': {
      group: 'Collect',
      label: 'Find open jobs',
      summary: 'Marks the companies hiring for a role, a reason to reach out now.',
      input: 'company',
      output: 'company',
      config: z.object({
         jobTitle: z.string().trim().min(1).max(100),
         howMany: howMany(100, 25),
         onlyHiring: z.boolean().default(true),
      }),
      fields: [
         {
            key: 'jobTitle',
            label: 'Job title',
            kind: 'text',
         },
         {
            key: 'howMany',
            label: 'How many jobs per 10 companies',
            kind: 'int',
            min: 1,
            max: 100,
         },
         {
            key: 'onlyHiring',
            label: 'Keep',
            kind: 'select',
            options: [
               {
                  value: 'true',
                  label: 'Only companies that are hiring',
               },
               {
                  value: 'false',
                  label: 'Every company, hiring ones marked',
               },
            ],
         },
      ],
   },
   'collect.domainLookup': {
      group: 'Collect',
      label: 'Find a company from its website',
      summary: 'Turns website addresses into companies.',
      input: 'start',
      output: 'company',
      config: z.object({
         domains: z.array(z.string().trim().toLowerCase().min(3).max(200)).min(1).max(100),
         howMany: howMany(100, 25),
      }),
      fields: [
         {
            key: 'domains',
            label: 'Websites',
            kind: 'words',
            hint: 'Separate with commas, such as stripe.com, acme.io.',
         },
         {
            key: 'howMany',
            label: 'How many companies at most',
            kind: 'int',
            min: 1,
            max: 100,
         },
      ],
   },
   'process.topN': {
      group: 'Process',
      label: 'Keep top N',
      summary: 'Keeps only the highest scored people.',
      input: 'profile',
      output: 'profile',
      config: z.object({ count: z.number().int().min(1).max(1_000).default(50) }),
      fields: [
         {
            key: 'count',
            label: 'How many to keep',
            kind: 'int',
            min: 1,
            max: 1_000,
         },
      ],
   },
   'process.tag': {
      group: 'Process',
      label: 'Tag',
      summary: 'Adds tags to everyone who passes, shown in the list.',
      input: 'profile',
      output: 'profile',
      config: z.object({ tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).min(1).max(10) }),
      fields: [
         {
            key: 'tags',
            label: 'Tags',
            kind: 'words',
            hint: 'Separate with commas. Up to 10, 30 characters each.',
         },
      ],
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
const howManyOf = (node: GraphNode) => numberOf(node, 'howMany')

const settingsOf = (node: GraphNode) => blockOf(node.type).config.safeParse(node.config).data ?? {}

const numberOf = (node: GraphNode, key: string) => {
   const value = settingsOf(node)[key]

   return typeof value === 'number' ? value : 0
}

const countOf = (node: GraphNode, key: string) => {
   const value = settingsOf(node)[key]

   return Array.isArray(value) ? value.length : 0
}

export type Available = { posts: number; profiles: number; companies: number }

// What one block passes on and costs at most, given how many items reach it.
const blockEstimate = (node: GraphNode, incoming: number, available: Available) => {
   const many = howManyOf(node)

   switch (node.type) {
      case 'input.posts':
         return {
            items: Math.min(many, available.posts),
            costMicros: 0,
         }
      case 'input.profiles':
         return {
            items: Math.min(many, countOf(node, 'links') || available.profiles),
            costMicros: 0,
         }
      case 'input.companies':
         return {
            items: Math.min(many, available.companies),
            costMicros: 0,
         }
      case 'collect.findPosts':
         return {
            items: many,
            costMicros: many * PRICE_MICROS.engagement,
         }
      case 'collect.commenters':
      case 'collect.reactors':
      case 'collect.postsOfPeople':
      case 'collect.postsOfCompanies':
         return {
            items: incoming * many,
            costMicros: incoming * many * PRICE_MICROS.engagement,
         }
      case 'collect.engagedPosts':
         return {
            items: incoming * many * 2,
            costMicros: incoming * many * 2 * PRICE_MICROS.engagement,
         }
      case 'collect.employees':
         return {
            items: incoming * many,
            costMicros:
               incoming * (many * PRICE_MICROS.profile + Math.ceil(many / EMPLOYEE_PAGE) * PRICE_MICROS.employeePage),
         }
      case 'collect.jobs':
         return {
            items: incoming,
            costMicros: Math.ceil(incoming / JOB_BATCH) * many * PRICE_MICROS.job,
         }
      case 'collect.domainLookup': {
         const found = Math.min(many, countOf(node, 'domains'))

         return {
            items: found,
            costMicros: found * PRICE_MICROS.lookup,
         }
      }
      case 'collect.profile':
         return {
            items: incoming,
            costMicros: incoming * PRICE_MICROS.profile,
         }
      case 'process.topN':
         return {
            items: Math.min(incoming, numberOf(node, 'count')),
            costMicros: 0,
         }
      default:
         // Triggers start with nothing; what another workflow passes on is not known before it runs.
         return {
            items: isTrigger(node.type) ? 0 : incoming,
            costMicros: 0,
         }
   }
}

// Companies sent to the jobs search in one request.
export const JOB_BATCH = 10

// The most a run can cost: every "how many" is reached and nobody is filtered out. `available` is what is waiting in
// the owner's lists.
export const estimateGraph = (graph: Graph, available: Available): Estimate => {
   const byId = new Map(graph.nodes.map(node => [node.id, node]))
   const nodes: Estimate['nodes'] = {}

   for (const id of topoOrder(graph)) {
      const node = byId.get(id)

      if (node) {
         const incoming = parentsOf(graph, id).reduce((sum, parent) => sum + (nodes[parent]?.items ?? 0), 0)

         nodes[id] = blockEstimate(node, incoming, available)
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

// The most "how many" a preview uses per block: one input item or post, at most 20 people.
const PREVIEW_CAPS: Partial<Record<BlockType, number>> = {
   'input.posts': PREVIEW_LIMITS.posts,
   'input.profiles': 1,
   'input.companies': 1,
   'collect.findPosts': PREVIEW_LIMITS.posts,
   'collect.postsOfPeople': PREVIEW_LIMITS.posts,
   'collect.postsOfCompanies': PREVIEW_LIMITS.posts,
   'collect.engagedPosts': PREVIEW_LIMITS.posts,
   'collect.commenters': PREVIEW_LIMITS.perPost,
   'collect.reactors': PREVIEW_LIMITS.perPost,
   'collect.employees': PREVIEW_LIMITS.perPost,
   'collect.jobs': 10,
   'collect.domainLookup': 1,
}

// The same workflow on a small sample.
export const previewGraph = (graph: Graph): Graph => ({
   ...graph,
   nodes: graph.nodes.map(node => {
      const cap = PREVIEW_CAPS[node.type]

      return cap === undefined
         ? node
         : {
              ...node,
              config: {
                 ...node.config,
                 howMany: Math.min(howManyOf(node), cap),
              },
           }
   }),
})

// Template 1: posts you chose, their commenters and reactors, scored, the qualified enriched, kept in a list.
export const flagshipGraph = (options: { icpId: string; posts: number; perPost: number }): Graph =>
   templateGraph('engagers', options)

// The goals of the guided start; each builds one template.
export const GOALS = ['engagers', 'problem', 'accounts', 'lookalikes', 'watch'] as const

export type Goal = (typeof GOALS)[number]

export type TemplateOptions = {
   icpId: string
   // Posts, profiles or companies the input takes, depending on the goal.
   posts: number
   // People per post or per company.
   perPost: number
   keywords?: string
   customer?: string
   titles?: string[]
}

const STEP_Y = 140
const BRANCH_X = 280

// Templates read top to bottom: `depth` is the step, `branch` places side-by-side blocks.
const step = (
   id: string,
   type: BlockType,
   depth: number,
   branch: number,
   config: GraphNode['config'] = {}
): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: branch * BRANCH_X,
      y: depth * STEP_Y,
   },
})

const linked = (pairs: string[][]) =>
   pairs.map(([from, to]) => ({
      from,
      to,
   }))

// Score, read full profiles of the qualified, keep them in the list. Starts at `depth`, after `from`.
const tail = (from: string[], depth: number, icpId: string, enrich = true) => {
   const nodes = [
      step('dedupe', 'process.dedupe', depth, 0),
      step('score', 'score.icp', depth + 1, 0, { icpId }),
      ...(enrich ? [step('enrich', 'collect.profile', depth + 2, 0)] : []),
      step('list', 'output.list', depth + (enrich ? 3 : 2), 0),
   ]
   const edges = [
      ...from.map(source => [source, 'dedupe']),
      ['dedupe', 'score'],
      ...(enrich
         ? [
              ['score', 'enrich'],
              ['enrich', 'list'],
           ]
         : [['score', 'list']]),
   ]

   return {
      nodes,
      edges,
   }
}

// Commenters and reactors of the posts from `from`, then the tail.
const engagersOf = (from: string, depth: number, options: TemplateOptions) => {
   const rest = tail(['commenters', 'reactors'], depth + 1, options.icpId)

   return {
      nodes: [
         step('commenters', 'collect.commenters', depth, 0, { howMany: options.perPost }),
         step('reactors', 'collect.reactors', depth, 1, { howMany: options.perPost }),
         ...rest.nodes,
      ],
      edges: [[from, 'commenters'], [from, 'reactors'], ...rest.edges],
   }
}

export const templateGraph = (goal: Goal, options: TemplateOptions): Graph => {
   if (goal === 'accounts') {
      const rest = tail(['employees'], 3, options.icpId, false)

      return {
         nodes: [
            step('trigger', 'trigger.manual', 0, 0),
            step('companies', 'input.companies', 1, 0, { howMany: options.posts }),
            step('employees', 'collect.employees', 2, 0, {
               howMany: options.perPost,
               titles: options.titles ?? [],
            }),
            ...rest.nodes,
         ],
         edges: linked([['trigger', 'companies'], ['companies', 'employees'], ...rest.edges]),
      }
   }

   const starts: Record<Exclude<Goal, 'accounts'>, { nodes: GraphNode[]; edges: string[][]; last: string }> = {
      engagers: {
         nodes: [
            step('trigger', 'trigger.manual', 0, 0),
            step('posts', 'input.posts', 1, 0, { howMany: options.posts }),
            step('done', 'output.markPosts', 2, 2),
         ],
         edges: [
            ['trigger', 'posts'],
            ['posts', 'done'],
         ],
         last: 'posts',
      },
      problem: {
         nodes: [
            step('trigger', 'trigger.manual', 0, 0),
            step('posts', 'collect.findPosts', 1, 0, {
               keywords: options.keywords ?? '',
               howMany: options.posts,
            }),
         ],
         edges: [['trigger', 'posts']],
         last: 'posts',
      },
      lookalikes: {
         nodes: [
            step('trigger', 'trigger.manual', 0, 0),
            step('customer', 'input.profiles', 1, 0, {
               howMany: 1,
               links: options.customer ? [options.customer] : [],
            }),
            step('posts', 'collect.engagedPosts', 2, 0, { howMany: options.posts }),
         ],
         edges: [
            ['trigger', 'customer'],
            ['customer', 'posts'],
         ],
         last: 'posts',
      },
      watch: {
         nodes: [
            step('trigger', 'trigger.schedule', 0, 0, { every: 'week' }),
            step('people', 'input.profiles', 1, 0, { howMany: options.posts }),
            step('posts', 'collect.postsOfPeople', 2, 0, { howMany: 3 }),
         ],
         edges: [
            ['trigger', 'people'],
            ['people', 'posts'],
         ],
         last: 'posts',
      },
   }
   const start = starts[goal]
   const rest = engagersOf(start.last, Math.max(...start.nodes.map(({ position }) => position.y)) / STEP_Y + 1, options)

   return {
      nodes: [...start.nodes, ...rest.nodes],
      edges: linked([...start.edges, ...rest.edges]),
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
