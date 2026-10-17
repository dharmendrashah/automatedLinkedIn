import { z } from 'zod'

import { INDUSTRY_PAIRS } from './industries'

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
   // One company page read on demand.
   companyPage: 4_000,
} as const

export const EMPLOYEE_PAGE = 25

// "All" comments or reactions still stops here per post, so a run's cost has an upper bound.
export const ALL_CAP = 1_000

type Option = { value: string; label: string }

// `advanced` settings sit under "More options" so a block opens simple.
export type Field = (
   | { key: string; label: string; kind: 'int'; min: number; max: number }
   | { key: string; label: string; kind: 'words' }
   | { key: string; label: string; kind: 'icp' }
   | { key: string; label: string; kind: 'time' }
   | { key: string; label: string; kind: 'text'; placeholder?: string }
   | { key: string; label: string; kind: 'select'; options: Option[] }
   | { key: string; label: string; kind: 'multi'; options: Option[] }
   // Many choices from a long list, picked by typing.
   | { key: string; label: string; kind: 'search'; options: Option[]; max: number }
   | { key: string; label: string; kind: 'toggle' }
   // "All" (the boolean `allKey`, capped at ALL_CAP) or "Up to" the number in `key`.
   | { key: string; label: string; kind: 'limit'; allKey: string; min: number; max: number }
   // One of the blocks connected before this one.
   | { key: string; label: string; kind: 'parent' }
   // Another workflow of the same owner.
   | { key: string; label: string; kind: 'workflow' }
) & { hint?: string; advanced?: boolean }

const optionsOf = (pairs: [string, string][]): Option[] =>
   pairs.map(([value, label]) => ({
      value,
      label,
   }))

// The choices the data service accepts, in plain words. "any" means the setting is not sent.
const COMMENT_AGES = optionsOf([
   ['any', 'Any time'],
   ['24h', 'Past 24 hours'],
   ['week', 'Past week'],
   ['month', 'Past month'],
])
const POST_AGES = optionsOf([
   ['any', 'Any time'],
   ['1h', 'Past hour'],
   ['24h', 'Past 24 hours'],
   ['week', 'Past week'],
   ['month', 'Past month'],
   ['3months', 'Past 3 months'],
   ['6months', 'Past 6 months'],
   ['year', 'Past year'],
])
const JOB_AGES = optionsOf([
   ['any', 'Any time'],
   ['1h', 'Past hour'],
   ['24h', 'Past 24 hours'],
   ['week', 'Past week'],
   ['month', 'Past month'],
])
const REACTION_TYPES = optionsOf([
   ['any', 'Any reaction'],
   ['LIKE', 'Like'],
   ['PRAISE', 'Celebrate'],
   ['EMPATHY', 'Support'],
   ['APPRECIATION', 'Love'],
   ['INTEREST', 'Insightful'],
   ['ENTERTAINMENT', 'Funny'],
])
const CONTENT_TYPES = optionsOf([
   ['all', 'Any kind'],
   ['images', 'Images'],
   ['videos', 'Videos'],
   ['documents', 'Documents'],
   ['live_videos', 'Live videos'],
   ['jobs', 'Job posts'],
   ['collaborative_articles', 'Collaborative articles'],
])
const SORTS = optionsOf([
   ['relevance', 'Most relevant'],
   ['date', 'Most recent'],
])
const FUNCTIONS = optionsOf(
   [
      'Accounting',
      'Administrative',
      'Arts and design',
      'Business development',
      'Community and social services',
      'Consulting',
      'Education',
      'Engineering',
      'Entrepreneurship',
      'Finance',
      'Healthcare services',
      'Human resources',
      'Information technology',
      'Legal',
      'Marketing',
      'Media and communication',
      'Military and protective services',
      'Operations',
      'Product management',
      'Program and project management',
      'Purchasing',
      'Quality assurance',
      'Real estate',
      'Research',
      'Sales',
      'Customer success and support',
   ].map((label, index) => [String(index + 1), label])
)
const HEADCOUNTS = optionsOf([
   ['1', 'Just 1'],
   ['2-10', '2 to 10'],
   ['11-50', '11 to 50'],
   ['51-200', '51 to 200'],
   ['201-500', '201 to 500'],
   ['501-1000', '501 to 1,000'],
   ['1001-5000', '1,001 to 5,000'],
   ['5001-10000', '5,001 to 10,000'],
   ['10001+', 'Over 10,000'],
])
// People search names the same sizes with letters.
const SEARCH_HEADCOUNTS = HEADCOUNTS.map((option, index) => ({
   ...option,
   value: 'ABCDEFGHI'.charAt(index),
}))
const INDUSTRIES = optionsOf(INDUSTRY_PAIRS)
export const RUN_WAITS = optionsOf([
   ['none', "Don't wait"],
   ['status', 'Wait until it is done (yes or no)'],
   ['results', 'Wait for its results'],
])
const RUN_SENDS = optionsOf([
   ['input', 'What reaches this block'],
   ['nothing', 'Nothing, just start it'],
])
const GIVE_UP_AFTER = optionsOf([
   ['15', '15 minutes'],
   ['30', '30 minutes'],
   ['60', '1 hour'],
   ['120', '2 hours'],
   ['240', '4 hours'],
   ['480', '8 hours'],
   ['720', '12 hours'],
   ['1440', '24 hours'],
])

// Blocks that keep what they did not pass on for an Else after them.
export const ELSE_SOURCES = new Set<BlockType>(['logic.if', 'logic.runWorkflow'])
const YEARS = optionsOf([
   ['1', 'Under 1 year'],
   ['2', '1 to 2 years'],
   ['3', '3 to 5 years'],
   ['4', '6 to 10 years'],
   ['5', 'Over 10 years'],
])
const SEARCH_SENIORITY = optionsOf([
   ['100', 'In training'],
   ['110', 'Entry level'],
   ['120', 'Senior'],
   ['130', 'Strategic'],
   ['200', 'Entry level manager'],
   ['210', 'Experienced manager'],
   ['220', 'Director'],
   ['300', 'Vice president'],
   ['310', 'C-level'],
   ['320', 'Owner or partner'],
])
const WORKPLACES = optionsOf([
   ['any', 'Any'],
   ['remote', 'Remote'],
   ['hybrid', 'Hybrid'],
   ['office', 'On site'],
])
const EMPLOYMENT = optionsOf([
   ['any', 'Any'],
   ['full-time', 'Full time'],
   ['part-time', 'Part time'],
   ['contract', 'Contract'],
   ['temporary', 'Temporary'],
   ['internship', 'Internship'],
])
const EXPERIENCE = optionsOf([
   ['any', 'Any'],
   ['internship', 'Internship'],
   ['entry', 'Entry level'],
   ['associate', 'Associate'],
   ['mid-senior', 'Mid to senior'],
   ['director', 'Director'],
   ['executive', 'Executive'],
])
const SALARIES = optionsOf([
   ['any', 'Any'],
   ...['40k+', '60k+', '80k+', '100k+', '120k+', '140k+', '160k+', '180k+', '200k+'].map((value): [string, string] => [
      value,
      `$${value}`,
   ]),
])

const isOption = (choices: Option[]) => (value: string) => choices.some(option => option.value === value)

const oneOf = (choices: Option[], fallback: string) =>
   z.string().refine(isOption(choices), 'is not a choice').default(fallback)

const someOf = (choices: Option[], max = choices.length) =>
   z
      .array(z.string().refine(isOption(choices), 'is not a choice'))
      .max(max)
      .default([])

const toggle = (fallback: boolean) => z.boolean().default(fallback)

const LINKS_HINT = 'Paste LinkedIn links, one by one.'

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

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const SCHEDULE_REPEATS = ['hours', 'day', 'weekdays', 'week', 'month'] as const

export const scheduleSchema = z
   .object({
      every: z.enum(SCHEDULE_REPEATS).default('day'),
      hours: z.number().int().min(1).max(24).default(24),
      // Every few hours, only inside this window and, if set, only Monday to Friday.
      between: z.boolean().default(false),
      from: clockTime.default('09:00'),
      until: clockTime.default('18:00'),
      weekdaysOnly: z.boolean().default(false),
      at: clockTime.default('09:00'),
      // Days of the week, 0 is Sunday; saved as text because block settings hold plain values. Empty reads `weekday`,
      // which schedules saved before kept.
      days: z
         .array(z.enum(['0', '1', '2', '3', '4', '5', '6']))
         .max(7)
         .default([]),
      weekday: z.number().int().min(0).max(6).default(1),
      dayOfMonth: z.number().int().min(1).max(28).default(1),
      timeZone: z.string().trim().min(1).max(64).refine(isTimeZone, 'is not a known time zone').default('UTC'),
   })
   .refine(({ between, from, until }) => !between || from < until, {
      message: 'must end after it starts',
      path: ['until'],
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
   'collect.searchPeople',
   'collect.commenters',
   'collect.reactors',
   'process.dedupe',
   'process.filter',
   'process.topN',
   'process.tag',
   'process.merge',
   'score.icp',
   'collect.profile',
   'logic.if',
   'logic.else',
   'logic.runWorkflow',
   'logic.forEach',
   'output.list',
   'output.markPosts',
   'output.csv',
   'output.sendApi',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

type BlockSpec = {
   group: 'Triggers' | 'Inputs' | 'Collect' | 'Process' | 'Logic' | 'Output'
   label: string
   summary: string
   // What a block costs, in words, such as "about $0.002 per person". Free blocks have none.
   costHint?: string
   // One-click starting points; each sets only its own settings.
   presets?: Preset[]
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
      // The browser draws its own schedule form from the schema's settings.
      fields: [],
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
      summary: 'The people who commented on each post, with what they wrote.',
      costHint: 'about $0.002 per comment',
      presets: [
         {
            label: 'Everyone',
            hint: `All comments, up to ${ALL_CAP.toLocaleString('en-US')} a post`,
            config: { all: true },
         },
         {
            label: 'Quick look',
            hint: 'Up to 20 a post',
            config: {
               all: false,
               howMany: 20,
            },
         },
         {
            label: 'Recent only',
            hint: 'Comments from the past week',
            config: { postedWithin: 'week' },
         },
      ],
      input: 'post',
      output: 'profile',
      config: z.object({
         all: toggle(false),
         howMany: howMany(500, 50),
         postedWithin: oneOf(COMMENT_AGES, 'any'),
         includeReplies: toggle(false),
      }),
      fields: [
         {
            key: 'howMany',
            allKey: 'all',
            label: 'How many comments per post',
            kind: 'limit',
            min: 1,
            max: 500,
            hint: `"All" reads up to ${ALL_CAP.toLocaleString('en-US')} per post.`,
         },
         {
            key: 'postedWithin',
            label: 'Only comments from',
            kind: 'select',
            options: COMMENT_AGES,
            advanced: true,
         },
         {
            key: 'includeReplies',
            label: 'Also people who replied to a comment',
            kind: 'toggle',
            advanced: true,
         },
      ],
   },
   'collect.reactors': {
      group: 'Collect',
      label: 'Get reactors',
      summary: 'The people who reacted to each post.',
      costHint: 'about $0.002 per reaction',
      presets: [
         {
            label: 'Everyone',
            hint: `All reactions, up to ${ALL_CAP.toLocaleString('en-US')} a post`,
            config: { all: true },
         },
         {
            label: 'Quick look',
            hint: 'Up to 20 a post',
            config: {
               all: false,
               howMany: 20,
            },
         },
      ],
      input: 'post',
      output: 'profile',
      config: z.object({
         all: toggle(false),
         howMany: howMany(500, 50),
         reactionType: oneOf(REACTION_TYPES, 'any'),
      }),
      fields: [
         {
            key: 'howMany',
            allKey: 'all',
            label: 'How many reactions per post',
            kind: 'limit',
            min: 1,
            max: 500,
            hint: `"All" reads up to ${ALL_CAP.toLocaleString('en-US')} per post.`,
         },
         {
            key: 'reactionType',
            label: 'Only this reaction',
            kind: 'select',
            options: REACTION_TYPES,
            advanced: true,
         },
      ],
   },
   'process.dedupe': {
      group: 'Process',
      label: 'Remove duplicates',
      summary: 'Keeps each person once and leaves out people you already have. Do-not-contact people always go.',
      input: 'profile',
      output: 'profile',
      config: z.object({
         skipListed: toggle(true),
         skipProfiles: toggle(true),
      }),
      fields: [
         {
            key: 'skipListed',
            label: 'Leave out people already in any of my lists',
            kind: 'toggle',
         },
         {
            key: 'skipProfiles',
            label: 'Leave out people in my LinkedIn profiles',
            kind: 'toggle',
         },
      ],
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
      summary: 'Gives each person a score from 0 to 100 and keeps the qualified and maybe ones.',
      presets: [
         {
            label: 'Strict',
            hint: 'Qualified at 75, maybe at 55',
            config: {
               qualifyScore: 75,
               maybeScore: 55,
            },
         },
         {
            label: 'Balanced',
            hint: 'Qualified at 60, maybe at 40',
            config: {
               qualifyScore: 60,
               maybeScore: 40,
            },
         },
         {
            label: 'Wide net',
            hint: 'Qualified at 45, maybe at 30',
            config: {
               qualifyScore: 45,
               maybeScore: 30,
            },
         },
      ],
      input: 'profile',
      output: 'profile',
      config: z
         .object({
            icpId: z.string().min(1),
            qualifyScore: z.number().int().min(1).max(100).default(60),
            maybeScore: z.number().int().min(1).max(100).default(40),
            keepMaybe: toggle(true),
         })
         .refine(({ qualifyScore, maybeScore }) => maybeScore < qualifyScore, {
            message: 'must be lower than the qualified score',
            path: ['maybeScore'],
         }),
      fields: [
         {
            key: 'icpId',
            label: 'Ideal customer',
            kind: 'icp',
         },
         {
            key: 'qualifyScore',
            label: 'Qualified at or above',
            kind: 'int',
            min: 1,
            max: 100,
            hint: 'Higher gives fewer, better people.',
         },
         {
            key: 'keepMaybe',
            label: 'Also keep "maybe" people',
            kind: 'toggle',
         },
         {
            key: 'maybeScore',
            label: 'Maybe at or above',
            kind: 'int',
            min: 1,
            max: 100,
            advanced: true,
         },
      ],
   },
   'collect.profile': {
      group: 'Collect',
      label: 'Get full profile',
      summary:
         'Reads the full profile of everyone who reaches it (job, company, place) and scores them again if a Score block came before.',
      costHint: 'about $0.004 per person',
      input: 'profile',
      output: 'profile',
      config: empty,
      fields: [],
   },
   'output.list': {
      group: 'Output',
      label: 'Add to list',
      summary: "Adds people to the workflow's list.",
      input: 'profile',
      output: 'profile',
      config: empty,
      fields: [],
   },
   'output.markPosts': {
      group: 'Output',
      label: 'Mark posts done',
      summary: 'Marks the posts as done when everything else has finished.',
      input: 'post',
      output: 'post',
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
      summary: 'Finds posts on LinkedIn that mention your keywords.',
      costHint: 'about $0.002 per post',
      presets: [
         {
            label: 'Fresh conversations',
            hint: 'Newest first, past week',
            config: {
               postedWithin: 'week',
               sortBy: 'date',
            },
         },
         {
            label: 'Best of the month',
            hint: 'Most relevant, past month',
            config: {
               postedWithin: 'month',
               sortBy: 'relevance',
            },
         },
      ],
      input: 'start',
      output: 'post',
      config: z.object({
         keywords: z.string().trim().min(1).max(200),
         postedWithin: oneOf(POST_AGES, 'month'),
         howMany: howMany(100, 10),
         sortBy: oneOf(SORTS, 'relevance'),
         contentType: oneOf(CONTENT_TYPES, 'all'),
         includeReposts: toggle(false),
         includeQuotePosts: toggle(false),
         authors: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
         mentioning: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
      }),
      fields: [
         {
            key: 'keywords',
            label: 'Keywords',
            kind: 'text',
            placeholder: 'cold email deliverability',
            hint: 'The words people use when they talk about it.',
         },
         {
            key: 'postedWithin',
            label: 'Posted within',
            kind: 'select',
            options: POST_AGES,
         },
         {
            key: 'howMany',
            label: 'How many posts',
            kind: 'int',
            min: 1,
            max: 100,
         },
         {
            key: 'sortBy',
            label: 'Show first',
            kind: 'select',
            options: SORTS,
            advanced: true,
         },
         {
            key: 'contentType',
            label: 'Kind of post',
            kind: 'select',
            options: CONTENT_TYPES,
            advanced: true,
         },
         {
            key: 'includeReposts',
            label: 'Include reposts',
            kind: 'toggle',
            advanced: true,
         },
         {
            key: 'includeQuotePosts',
            label: 'Include quote posts',
            kind: 'toggle',
            advanced: true,
         },
         {
            key: 'authors',
            label: 'Only posts by these people',
            kind: 'words',
            hint: LINKS_HINT,
            advanced: true,
         },
         {
            key: 'mentioning',
            label: 'Only posts mentioning these people or companies',
            kind: 'words',
            hint: LINKS_HINT,
            advanced: true,
         },
      ],
   },
   'collect.postsOfPeople': {
      group: 'Collect',
      label: 'Posts of people',
      summary: 'The recent posts of each person.',
      costHint: 'about $0.002 per post',
      input: 'profile',
      output: 'post',
      config: z.object({
         howMany: howMany(50, 5),
         postedWithin: oneOf(POST_AGES, 'any'),
         includeReposts: toggle(false),
      }),
      fields: [
         {
            key: 'howMany',
            label: 'How many posts per person',
            kind: 'int',
            min: 1,
            max: 50,
         },
         {
            key: 'postedWithin',
            label: 'Posted within',
            kind: 'select',
            options: POST_AGES,
         },
         {
            key: 'includeReposts',
            label: 'Include reposts',
            kind: 'toggle',
            advanced: true,
         },
      ],
   },
   'collect.postsOfCompanies': {
      group: 'Collect',
      label: 'Posts of companies',
      summary: 'The recent posts of each company page.',
      costHint: 'about $0.002 per post',
      input: 'company',
      output: 'post',
      config: z.object({
         howMany: howMany(50, 5),
         postedWithin: oneOf(POST_AGES, 'any'),
         includeReposts: toggle(false),
      }),
      fields: [
         {
            key: 'howMany',
            label: 'How many posts per company',
            kind: 'int',
            min: 1,
            max: 50,
         },
         {
            key: 'postedWithin',
            label: 'Posted within',
            kind: 'select',
            options: POST_AGES,
         },
         {
            key: 'includeReposts',
            label: 'Include reposts',
            kind: 'toggle',
            advanced: true,
         },
      ],
   },
   'collect.engagedPosts': {
      group: 'Collect',
      label: 'What this person engages with',
      summary: 'The posts each person recently commented on or reacted to.',
      costHint: 'about $0.002 per post',
      input: 'profile',
      output: 'post',
      config: z.object({
         howMany: howMany(50, 10),
         postedWithin: oneOf(COMMENT_AGES, 'any'),
      }),
      fields: [
         {
            key: 'howMany',
            label: 'How many comments and how many reactions per person',
            kind: 'int',
            min: 1,
            max: 50,
         },
         {
            key: 'postedWithin',
            label: 'Only from',
            kind: 'select',
            options: COMMENT_AGES,
            advanced: true,
         },
      ],
   },
   'collect.employees': {
      group: 'Collect',
      label: 'Find people at a company',
      summary: 'People who work at each company, with their full profile.',
      costHint: 'about $0.004 per person plus $0.10 per 25',
      presets: [
         {
            label: 'Leadership',
            hint: 'Directors, VPs, C-level, owners',
            config: { seniority: ['220', '300', '310', '320'] },
         },
         {
            label: 'Sales team',
            hint: 'Everyone in sales',
            config: { functions: ['25'] },
         },
         {
            label: 'Marketing team',
            hint: 'Everyone in marketing',
            config: { functions: ['15'] },
         },
         {
            label: 'Engineering team',
            hint: 'Everyone in engineering',
            config: { functions: ['8'] },
         },
         {
            label: 'New joiners',
            hint: 'Less than a year at the company',
            config: { yearsAtCompany: ['1'] },
         },
      ],
      input: 'company',
      output: 'profile',
      config: z.object({
         howMany: howMany(500, 25),
         titles: words,
         seniority: z
            .array(z.enum(['120', '200', '210', '220', '300', '310', '320']))
            .max(7)
            .default([]),
         functions: someOf(FUNCTIONS),
         locations: words,
         pastTitles: words,
         yearsAtCompany: someOf(YEARS),
         yearsOfExperience: someOf(YEARS),
         headcount: someOf(HEADCOUNTS),
         changedJobs: toggle(false),
         industries: someOf(INDUSTRIES, 50),
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
            hint: 'Empty takes any title.',
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
         {
            key: 'functions',
            label: 'Department',
            kind: 'multi',
            options: FUNCTIONS,
            advanced: true,
         },
         {
            key: 'locations',
            label: 'Located in',
            kind: 'words',
            hint: 'Cities or countries, such as London or Germany.',
            advanced: true,
         },
         {
            key: 'pastTitles',
            label: 'Past job titles',
            kind: 'words',
            advanced: true,
         },
         {
            key: 'yearsAtCompany',
            label: 'Years at the company',
            kind: 'multi',
            options: YEARS,
            advanced: true,
         },
         {
            key: 'yearsOfExperience',
            label: 'Years of experience',
            kind: 'multi',
            options: YEARS,
            advanced: true,
         },
         {
            key: 'headcount',
            label: 'Company size',
            kind: 'multi',
            options: HEADCOUNTS,
            advanced: true,
         },
         {
            key: 'industries',
            label: 'Industry',
            kind: 'search',
            options: INDUSTRIES,
            max: 50,
            advanced: true,
         },
         {
            key: 'changedJobs',
            label: 'Only people who changed jobs recently',
            kind: 'toggle',
            advanced: true,
         },
      ],
   },
   'collect.jobs': {
      group: 'Collect',
      label: 'Find open jobs',
      summary: 'Marks the companies hiring for a role, a reason to reach out now.',
      costHint: 'about $0.001 per job',
      presets: [
         {
            label: 'Hiring this week',
            hint: 'Jobs posted in the past week',
            config: { postedWithin: 'week' },
         },
         {
            label: 'Remote roles',
            hint: 'Only remote jobs',
            config: { workplace: 'remote' },
         },
         {
            label: 'Leadership hires',
            hint: 'Director and executive jobs',
            config: { experience: 'director' },
         },
      ],
      input: 'company',
      output: 'company',
      config: z.object({
         jobTitle: z.string().trim().min(1).max(100),
         howMany: howMany(100, 25),
         onlyHiring: z.boolean().default(true),
         location: z.string().trim().max(100).default(''),
         workplace: oneOf(WORKPLACES, 'any'),
         employment: oneOf(EMPLOYMENT, 'any'),
         experience: oneOf(EXPERIENCE, 'any'),
         postedWithin: oneOf(JOB_AGES, 'any'),
         salary: oneOf(SALARIES, 'any'),
         sortBy: oneOf(SORTS, 'relevance'),
         easyApply: toggle(false),
         fewApplicants: toggle(false),
         industries: someOf(INDUSTRIES, 20),
      }),
      fields: [
         {
            key: 'jobTitle',
            label: 'Job title',
            kind: 'text',
            placeholder: 'Sales development representative',
         },
         {
            key: 'onlyHiring',
            label: 'Keep only companies that are hiring',
            kind: 'toggle',
         },
         {
            key: 'howMany',
            label: 'How many jobs per 10 companies',
            kind: 'int',
            min: 1,
            max: 100,
            advanced: true,
         },
         {
            key: 'location',
            label: 'Located in',
            kind: 'text',
            placeholder: 'United States',
            hint: 'One city, region or country.',
            advanced: true,
         },
         {
            key: 'workplace',
            label: 'Workplace',
            kind: 'select',
            options: WORKPLACES,
            advanced: true,
         },
         {
            key: 'employment',
            label: 'Employment',
            kind: 'select',
            options: EMPLOYMENT,
            advanced: true,
         },
         {
            key: 'experience',
            label: 'Experience level',
            kind: 'select',
            options: EXPERIENCE,
            advanced: true,
         },
         {
            key: 'postedWithin',
            label: 'Posted within',
            kind: 'select',
            options: JOB_AGES,
            advanced: true,
         },
         {
            key: 'salary',
            label: 'Salary at least',
            kind: 'select',
            options: SALARIES,
            advanced: true,
         },
         {
            key: 'industries',
            label: 'Industry',
            kind: 'search',
            options: INDUSTRIES,
            max: 20,
            advanced: true,
         },
         {
            key: 'sortBy',
            label: 'Show first',
            kind: 'select',
            options: SORTS,
            advanced: true,
         },
         {
            key: 'easyApply',
            label: 'Only jobs with easy apply',
            kind: 'toggle',
            advanced: true,
         },
         {
            key: 'fewApplicants',
            label: 'Only jobs with under 10 applicants',
            kind: 'toggle',
            advanced: true,
         },
      ],
   },
   'collect.domainLookup': {
      group: 'Collect',
      label: 'Find a company from its website',
      summary: 'Turns website addresses into company pages.',
      costHint: 'about $0.004 per company',
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
            hint: 'Such as stripe.com and acme.io.',
         },
         {
            key: 'howMany',
            label: 'How many companies at most',
            kind: 'int',
            min: 1,
            max: 100,
            advanced: true,
         },
      ],
   },
   'collect.searchPeople': {
      group: 'Collect',
      label: 'Search people',
      summary: 'Finds people on LinkedIn by keywords, job title, company, place and more.',
      costHint: 'about $0.004 per person',
      presets: [
         {
            label: 'Decision makers',
            hint: 'Directors, VPs, C-level, owners',
            config: { seniority: ['220', '300', '310', '320'] },
         },
         {
            label: 'Founders of small companies',
            hint: 'Owners and C-level at 1 to 50 people',
            config: {
               seniority: ['310', '320'],
               headcount: ['A', 'B', 'C'],
            },
         },
         {
            label: 'Sales leaders',
            hint: 'Sales, director and up',
            config: {
               functions: ['25'],
               seniority: ['220', '300', '310'],
            },
         },
         {
            label: 'Marketing leaders',
            hint: 'Marketing, director and up',
            config: {
               functions: ['15'],
               seniority: ['220', '300', '310'],
            },
         },
         {
            label: 'New in their job',
            hint: 'Changed jobs recently',
            config: { changedJobs: true },
         },
      ],
      input: 'start',
      output: 'profile',
      config: z.object({
         keywords: z.string().trim().max(200).default(''),
         titles: words,
         companies: words,
         locations: words,
         seniority: someOf(SEARCH_SENIORITY),
         functions: someOf(FUNCTIONS),
         headcount: someOf(SEARCH_HEADCOUNTS),
         industries: someOf(INDUSTRIES, 50),
         yearsOfExperience: someOf(YEARS),
         changedJobs: toggle(false),
         postedRecently: toggle(false),
         howMany: howMany(500, 25),
      }),
      fields: [
         {
            key: 'keywords',
            label: 'Keywords',
            kind: 'text',
            placeholder: 'growth marketing SaaS',
         },
         {
            key: 'titles',
            label: 'Current job titles',
            kind: 'words',
         },
         {
            key: 'locations',
            label: 'Located in',
            kind: 'words',
            hint: 'Cities or countries, such as London or Germany.',
         },
         {
            key: 'howMany',
            label: 'How many people',
            kind: 'int',
            min: 1,
            max: 500,
            hint: 'Searched in pages of 25, so 25, 50 or 75 make the most of the price.',
         },
         {
            key: 'companies',
            label: 'Working at',
            kind: 'words',
            hint: 'Company names or LinkedIn company links.',
            advanced: true,
         },
         {
            key: 'seniority',
            label: 'Seniority',
            kind: 'multi',
            options: SEARCH_SENIORITY,
            advanced: true,
         },
         {
            key: 'functions',
            label: 'Department',
            kind: 'multi',
            options: FUNCTIONS,
            advanced: true,
         },
         {
            key: 'headcount',
            label: 'Company size',
            kind: 'multi',
            options: SEARCH_HEADCOUNTS,
            advanced: true,
         },
         {
            key: 'industries',
            label: 'Industry',
            kind: 'search',
            options: INDUSTRIES,
            max: 50,
            advanced: true,
         },
         {
            key: 'yearsOfExperience',
            label: 'Years of experience',
            kind: 'multi',
            options: YEARS,
            advanced: true,
         },
         {
            key: 'changedJobs',
            label: 'Only people who changed jobs recently',
            kind: 'toggle',
            advanced: true,
         },
         {
            key: 'postedRecently',
            label: 'Only people who posted recently',
            kind: 'toggle',
            advanced: true,
         },
      ],
   },
   'process.topN': {
      group: 'Process',
      label: 'Keep top N',
      summary: 'Keeps only the best people, by score or by followers.',
      input: 'profile',
      output: 'profile',
      config: z.object({
         count: z.number().int().min(1).max(1_000).default(50),
         by: oneOf(
            optionsOf([
               ['score', 'Highest score'],
               ['followers', 'Most followers'],
            ]),
            'score'
         ),
      }),
      fields: [
         {
            key: 'count',
            label: 'How many to keep',
            kind: 'int',
            min: 1,
            max: 1_000,
         },
         {
            key: 'by',
            label: 'Best by',
            kind: 'select',
            options: optionsOf([
               ['score', 'Highest score'],
               ['followers', 'Most followers'],
            ]),
         },
      ],
   },
   'process.merge': {
      group: 'Process',
      label: 'Merge',
      summary: 'Joins what two or more blocks found into one stream.',
      input: 'profile',
      output: 'profile',
      config: z.object({
         mode: oneOf(
            optionsOf([
               ['all', 'Everything, each once'],
               ['every', 'Only what every line has'],
               ['onlyMain', 'Only what the main line has and the others do not'],
            ]),
            'all'
         ),
         main: z.string().max(40).default(''),
      }),
      fields: [
         {
            key: 'mode',
            label: 'Keep',
            kind: 'select',
            options: optionsOf([
               ['all', 'Everything, each once'],
               ['every', 'Only what every line has'],
               ['onlyMain', 'Only what the main line has and the others do not'],
            ]),
         },
         {
            key: 'main',
            label: 'Main line (for the last choice)',
            kind: 'parent',
         },
      ],
   },
   'process.tag': {
      group: 'Process',
      label: 'Add label',
      summary: 'Adds labels to everyone who passes, shown in the list.',
      input: 'profile',
      output: 'profile',
      config: z.object({ tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).min(1).max(10) }),
      fields: [
         {
            key: 'tags',
            label: 'Labels',
            kind: 'words',
            hint: 'Up to 10, 30 characters each.',
         },
      ],
   },
   'logic.if': {
      group: 'Logic',
      label: 'If',
      summary: 'Passes on the people who match; connect an Else after it for the rest.',
      input: 'profile',
      output: 'profile',
      config: z.object({
         match: z.enum(['all', 'any']).default('all'),
         minScore: z.number().int().min(0).max(100).default(0),
         minFollowers: z.number().int().min(0).max(10_000_000).default(0),
         signal: z.enum(['any', 'commented', 'reacted']).default('any'),
         headlineHas: words,
         locationHas: words,
         companyHas: words,
         hasLabel: words,
      }),
      fields: [
         {
            key: 'match',
            label: 'Match',
            kind: 'select',
            options: [
               {
                  value: 'all',
                  label: 'All conditions (and)',
               },
               {
                  value: 'any',
                  label: 'Any condition (or)',
               },
            ],
         },
         {
            key: 'minScore',
            label: 'Score at least',
            kind: 'int',
            min: 0,
            max: 100,
            hint: '0 leaves this condition out.',
         },
         {
            key: 'minFollowers',
            label: 'Followers at least',
            kind: 'int',
            min: 0,
            max: 10_000_000,
            hint: '0 leaves this condition out.',
         },
         {
            key: 'signal',
            label: 'Found because they',
            kind: 'select',
            options: [
               {
                  value: 'any',
                  label: 'Any reason',
               },
               {
                  value: 'commented',
                  label: 'Commented',
               },
               {
                  value: 'reacted',
                  label: 'Reacted',
               },
            ],
         },
         {
            key: 'headlineHas',
            label: 'Headline has one of',
            kind: 'words',
         },
         {
            key: 'locationHas',
            label: 'Location has one of',
            kind: 'words',
         },
         {
            key: 'companyHas',
            label: 'Company has one of',
            kind: 'words',
         },
         {
            key: 'hasLabel',
            label: 'Has one of these labels',
            kind: 'words',
         },
      ],
   },
   'logic.else': {
      group: 'Logic',
      label: 'Else',
      summary: 'What the If or "Run another workflow" before it did not pass on.',
      input: 'profile',
      output: 'profile',
      config: empty,
      fields: [],
   },
   'logic.runWorkflow': {
      group: 'Logic',
      label: 'Run another workflow',
      summary:
         'Starts another of your workflows. Go on at once, wait for a yes or no, or wait for the people it saves.',
      costHint: 'what the other workflow costs',
      input: 'profile',
      output: 'profile',
      config: z.object({
         workflowId: z.string().min(1),
         send: oneOf(RUN_SENDS, 'input'),
         wait: oneOf(RUN_WAITS, 'none'),
         giveUpAfter: oneOf(GIVE_UP_AFTER, '120'),
      }),
      fields: [
         {
            key: 'workflowId',
            label: 'Workflow to run',
            kind: 'workflow',
         },
         {
            key: 'wait',
            label: 'Wait',
            kind: 'select',
            options: RUN_WAITS,
            hint: 'With "yes or no", what does not pass goes to an Else after this block.',
         },
         {
            key: 'send',
            label: 'Send it',
            kind: 'select',
            options: RUN_SENDS,
         },
         {
            key: 'giveUpAfter',
            label: 'Give up waiting after',
            kind: 'select',
            options: GIVE_UP_AFTER,
            hint: 'The other workflow keeps running; this one goes on as "no".',
            advanced: true,
         },
      ],
   },
   'logic.forEach': {
      group: 'Logic',
      label: 'For each',
      summary: 'Runs the blocks after it once per batch, so a run can stop early when the wallet runs low.',
      input: 'profile',
      output: 'profile',
      config: z.object({ batchSize: z.number().int().min(1).max(500).default(25) }),
      fields: [
         {
            key: 'batchSize',
            label: 'Items per batch',
            kind: 'int',
            min: 1,
            max: 500,
         },
      ],
   },
   'output.csv': {
      group: 'Output',
      label: 'Export to CSV',
      summary: 'Keeps what reaches it for 90 days to see and download from the run.',
      input: 'profile',
      output: 'profile',
      config: z.object({ fileName: z.string().trim().max(80).default('') }),
      fields: [
         {
            key: 'fileName',
            label: 'File name (optional)',
            kind: 'text',
         },
      ],
   },
   'output.sendApi': {
      group: 'Output',
      label: 'Send via API',
      summary: 'Sends what reaches it as JSON to your HTTPS address.',
      input: 'profile',
      output: 'profile',
      config: z.object({
         url: z
            .string()
            .trim()
            .max(500)
            .url()
            .refine(value => value.startsWith('https://'), 'must start with https://'),
         secret: z.string().trim().max(200).default(''),
      }),
      fields: [
         {
            key: 'url',
            label: 'Your HTTPS address',
            kind: 'text',
         },
         {
            key: 'secret',
            label: 'Secret sent in the X-Workflow-Secret header (optional)',
            kind: 'text',
         },
      ],
   },
} as const satisfies Record<BlockType, BlockSpec>

export const blockOf = (type: BlockType): BlockSpec => BLOCKS[type]

// The catalog as plain data, for the browser's palette and settings forms.
export const catalog = (): CatalogBlock[] =>
   BLOCK_TYPES.map(type => {
      const { group, label, summary, input, output, fields, config } = BLOCKS[type]
      const spec: BlockSpec = BLOCKS[type]

      return {
         type,
         group,
         label,
         summary,
         costHint: spec.costHint ?? null,
         presets: spec.presets ?? [],
         input,
         output,
         fields,
         // Empty when a setting has no default, such as the ideal customer to score against.
         defaults: configSchema.safeParse(config.safeParse({}).data ?? {}).data ?? {},
      }
   })

const nodeId = z.string().regex(/^[\w-]{1,40}$/)

const side = z.enum(['top', 'right', 'bottom', 'left'])

export const DEFAULT_LOOP_ROUNDS = 3
export const MAX_LOOP_ROUNDS = 10

// Plain values only, so a graph is stored as JSON as it is.
const configSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))

export type NodeConfig = z.infer<typeof configSchema>

export type Preset = { label: string; hint: string; config: NodeConfig }

export type CatalogBlock = {
   type: BlockType
   group: BlockSpec['group']
   label: string
   summary: string
   costHint: string | null
   presets: Preset[]
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
      .max(50),
   edges: z
      .array(
         z.object({
            from: nodeId,
            to: nodeId,
            // Where the line leaves and enters on the canvas; drawing only.
            fromSide: side.optional(),
            toSide: side.optional(),
         })
      )
      .max(100),
   // How many times a loop (a line back to an earlier block) may run.
   loopRounds: z.number().int().min(1).max(MAX_LOOP_ROUNDS).optional(),
})

export type Graph = z.infer<typeof graphSchema>
export type GraphNode = Graph['nodes'][number]
export type GraphEdge = Graph['edges'][number]
// An error stops a run; a note only explains what will happen.
export type GraphError = { nodeId?: string; message: string; level: 'error' | 'note' }

export const loopRoundsOf = (graph: Graph) => graph.loopRounds ?? DEFAULT_LOOP_ROUNDS

const isTrigger = (type: BlockType) => BLOCKS[type].input === null

const parentsOf = (graph: Graph, id: string) => graph.edges.filter(edge => edge.to === id).map(edge => edge.from)

export const edgeKey = ({ from, to }: { from: string; to: string }) => `${from}>${to}`

// Lines that go back to a block already on the way (depth-first from the blocks with nothing before them).
export const backEdges = (graph: Graph) => {
   const state = new Map<string, 'open' | 'done'>()
   const back = new Set<string>()
   const visit = (id: string) => {
      state.set(id, 'open')

      for (const edge of graph.edges.filter(({ from }) => from === id)) {
         const seen = state.get(edge.to)

         if (seen === 'open') {
            back.add(edgeKey(edge))
         } else if (!seen) {
            visit(edge.to)
         }
      }

      state.set(id, 'done')
   }
   const roots = graph.nodes.filter(node => parentsOf(graph, node.id).length === 0)

   for (const node of [...roots, ...graph.nodes]) {
      if (!state.has(node.id)) {
         visit(node.id)
      }
   }

   return back
}

export const forwardEdges = (graph: Graph) => {
   const back = backEdges(graph)

   return graph.edges.filter(edge => !back.has(edgeKey(edge)))
}

// Kahn's order over the forward lines, so a loop's way back does not hide its blocks.
export const topoOrder = (graph: Graph) => {
   const edges = forwardEdges(graph)
   const incoming = new Map(graph.nodes.map(node => [node.id, edges.filter(({ to }) => to === node.id).length]))
   const ready = graph.nodes.filter(node => incoming.get(node.id) === 0).map(node => node.id)
   const order: string[] = []

   while (ready.length > 0) {
      const id = ready.shift() ?? ''

      order.push(id)

      for (const edge of edges.filter(({ from }) => from === id)) {
         const left = (incoming.get(edge.to) ?? 0) - 1

         incoming.set(edge.to, left)

         if (left === 0) {
            ready.push(edge.to)
         }
      }
   }

   return order
}

const downstreamOf = (edges: GraphEdge[], start: string) => {
   const found = new Set([start])
   const queue = [start]

   while (queue.length > 0) {
      const id = queue.shift() ?? ''

      for (const { to } of edges.filter(({ from }) => from === id)) {
         if (!found.has(to)) {
            found.add(to)
            queue.push(to)
         }
      }
   }

   return found
}

// The parts of a graph that run more than once: a For each and what follows it (once per batch), and a loop from the
// block a line goes back to (once per round).
export type RepeatRegion = { kind: 'forEach' | 'loop'; start: string; nodes: Set<string>; backEdge?: GraphEdge }

export const repeatRegions = (graph: Graph): RepeatRegion[] => {
   const back = backEdges(graph)
   const edges = graph.edges.filter(edge => !back.has(edgeKey(edge)))

   return [
      ...graph.nodes
         .filter(({ type }) => type === 'logic.forEach')
         .map(node => ({
            kind: 'forEach' as const,
            start: node.id,
            nodes: downstreamOf(edges, node.id),
         })),
      ...graph.edges
         .filter(edge => back.has(edgeKey(edge)))
         .map(edge => ({
            kind: 'loop' as const,
            start: edge.to,
            nodes: downstreamOf(edges, edge.to),
            backEdge: edge,
         })),
   ]
}

const configErrors = (node: GraphNode): GraphError[] => {
   const result = BLOCKS[node.type].config.safeParse(node.config)

   return result.success
      ? []
      : result.error.issues.map(issue => ({
           nodeId: node.id,
           level: 'error' as const,
           message: `${BLOCKS[node.type].label}: ${issue.path.join('.') || 'settings'} ${issue.message.toLowerCase()}`,
        }))
}

// What happens to items a block does not take: posts become their authors where a block wants people, the rest
// passes through unchanged.
export const convertsTo = (gives: ItemKind, needs: ItemKind) => gives === 'post' && needs === 'profile'

const edgeNotes = (graph: Graph, byId: Map<string, GraphNode>): GraphError[] =>
   graph.edges.flatMap(({ from, to }): GraphError[] => {
      const source = byId.get(from)
      const target = byId.get(to)

      if (!source || !target || from === to) {
         return [
            {
               level: 'error' as const,
               message: 'A connection points at a block that does not exist.',
            },
         ]
      }

      const gives = BLOCKS[source.type].output
      const needs = BLOCKS[target.type].input
      const { label } = BLOCKS[target.type]

      if (needs === null) {
         return [
            {
               nodeId: to,
               level: 'note' as const,
               message: `${label} starts the workflow and ignores what comes in.`,
            },
         ]
      }

      if (
         gives === null ||
         gives === needs ||
         needs === 'start' ||
         target.type === 'process.merge' ||
         target.type === 'logic.runWorkflow'
      ) {
         return []
      }

      return [
         {
            nodeId: to,
            level: 'note' as const,
            message: convertsTo(gives, needs)
               ? `${label} gets posts: it uses their authors.`
               : `${label} needs ${KIND_LABELS[needs]}; the ${KIND_LABELS[gives]} it gets pass through unchanged.`,
         },
      ]
   })

const OUTPUTS = new Set<BlockType>(['output.list', 'output.csv', 'output.sendApi', 'output.markPosts'])

// Only an error stops a run. Notes explain what will happen with a free-form graph.
export const validateGraph = (graph: Graph): GraphError[] => {
   const byId = new Map(graph.nodes.map(node => [node.id, node]))
   const problems: GraphError[] = []
   const note = (message: string, nodeId?: string) =>
      problems.push({
         nodeId,
         level: 'note',
         message,
      })

   if (byId.size !== graph.nodes.length) {
      problems.push({
         level: 'error',
         message: 'Two blocks share the same id.',
      })
   }

   if (new Set(graph.edges.map(edgeKey)).size !== graph.edges.length) {
      problems.push({
         level: 'error',
         message: 'Two blocks are connected twice.',
      })
   }

   problems.push(...graph.nodes.flatMap(configErrors), ...edgeNotes(graph, byId))

   if (!graph.nodes.some(node => isTrigger(node.type))) {
      note('No trigger: Run starts from the blocks with nothing before them.')
   }

   for (const node of graph.nodes) {
      if (!isTrigger(node.type) && BLOCKS[node.type].input !== 'start' && parentsOf(graph, node.id).length === 0) {
         note(`${BLOCKS[node.type].label} has nothing before it, so it gets nothing.`, node.id)
      }

      if (
         node.type === 'logic.else' &&
         !parentsOf(graph, node.id).some(id => ELSE_SOURCES.has(byId.get(id)?.type ?? 'logic.else'))
      ) {
         note('Else passes on nothing unless an If or "Run another workflow" comes right before it.', node.id)
      }
   }

   if (!graph.nodes.some(node => OUTPUTS.has(node.type))) {
      note('Nothing keeps the results: add "Add to list", "Export to CSV" or "Send via API".')
   }

   for (const region of repeatRegions(graph)) {
      if (region.kind === 'loop') {
         note(`These blocks form a loop; it runs up to ${loopRoundsOf(graph)} rounds.`, region.start)
      }
   }

   return problems
}

export const errorsOf = (problems: GraphError[]) => problems.filter(({ level }) => level === 'error')

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
      case 'collect.reactors': {
         const limit = settingsOf(node).all === true ? ALL_CAP : many

         return {
            items: incoming * limit,
            costMicros: incoming * limit * PRICE_MICROS.engagement,
         }
      }
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
      case 'collect.searchPeople':
         // Searched in whole pages of 25 people.
         return {
            items: many,
            costMicros: Math.ceil(many / 25) * 25 * PRICE_MICROS.profile,
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

// The most a run can cost: every "how many" is reached, nobody is filtered out, and every loop runs all its rounds.
// `available` is what is waiting in the owner's lists.
export const estimateGraph = (graph: Graph, available: Available): Estimate => {
   const byId = new Map(graph.nodes.map(node => [node.id, node]))
   const edges = forwardEdges(graph)
   const nodes: Estimate['nodes'] = {}

   for (const id of topoOrder(graph)) {
      const node = byId.get(id)

      if (node) {
         const incoming = edges
            .filter(({ to }) => to === id)
            .reduce((sum, { from }) => sum + (nodes[from]?.items ?? 0), 0)

         nodes[id] = blockEstimate(node, incoming, available)
      }
   }

   const looped = new Set(
      repeatRegions(graph)
         .filter(({ kind }) => kind === 'loop')
         .flatMap(({ nodes: ids }) => [...ids])
   )
   const rounds = loopRoundsOf(graph)

   for (const id of looped) {
      const estimate = nodes[id]

      if (estimate) {
         nodes[id] = {
            items: estimate.items * rounds,
            costMicros: estimate.costMicros * rounds,
         }
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
   'collect.searchPeople': PREVIEW_LIMITS.perPost,
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
                 // A preview never reads "all".
                 ...(node.config.all === true ? { all: false } : {}),
              },
           }
   }),
})

// Template 1: posts you chose, their commenters and reactors, scored, the qualified enriched, kept in a list.
export const flagshipGraph = (options: { icpId: string; posts: number; perPost: number }): Graph =>
   templateGraph('engagers', options)

// The ready-made templates; each id builds one graph.
export const GOALS = [
   'engagers',
   'problem',
   'accounts',
   'lookalikes',
   'watch',
   'decisionMakers',
   'hiring',
   'websites',
   'competitor',
   'newInJob',
   'sharedAudience',
] as const

export type Goal = (typeof GOALS)[number]

export type TemplateOptions = {
   // Set on the canvas when left out; the Score block asks for it until then.
   icpId?: string
   // Posts, profiles or companies the input takes, depending on the goal.
   posts: number
   // People per post or per company.
   perPost: number
   keywords?: string
   customer?: string
   titles?: string[]
   jobTitle?: string
   domains?: string[]
   // The owner's time zone, for a template that runs on a schedule.
   timeZone?: string
}

// The sizes a template starts with; everything else is set on the canvas.
export const TEMPLATE_NUMBERS = {
   posts: 5,
   perPost: 50,
}

const LEADERSHIP = ['220', '300', '310', '320']

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
const tail = (from: string[], depth: number, icpId: string | undefined, enrich = true) => {
   const nodes = [
      step('dedupe', 'process.dedupe', depth, 0),
      step('score', 'score.icp', depth + 1, 0, icpId ? { icpId } : {}),
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

type OwnGoal = 'decisionMakers' | 'hiring' | 'websites' | 'newInJob' | 'sharedAudience'

const OWN_GOALS = new Set<Goal>(['decisionMakers', 'hiring', 'websites', 'newInJob', 'sharedAudience'])

const isOwn = (goal: Goal): goal is OwnGoal => OWN_GOALS.has(goal)

// The templates that do not end in "commenters and reactors of some posts".
const ownGraph = (goal: OwnGoal, options: TemplateOptions): Graph => {
   const leaders = {
      howMany: options.perPost,
      seniority: LEADERSHIP,
   }

   if (goal === 'hiring') {
      const rest = tail(['employees'], 4, options.icpId, false)

      return {
         nodes: [
            step('trigger', 'trigger.manual', 0, 0),
            step('companies', 'input.companies', 1, 0, { howMany: options.posts * 4 }),
            step('jobs', 'collect.jobs', 2, 0, { jobTitle: options.jobTitle ?? '' }),
            step('employees', 'collect.employees', 3, 0, {
               ...leaders,
               howMany: 25,
            }),
            ...rest.nodes,
         ],
         edges: linked([['trigger', 'companies'], ['companies', 'jobs'], ['jobs', 'employees'], ...rest.edges]),
      }
   }

   if (goal === 'websites') {
      const rest = tail(['employees'], 3, options.icpId, false)

      return {
         nodes: [
            step('trigger', 'trigger.manual', 0, 0),
            step('sites', 'collect.domainLookup', 1, 0, { domains: options.domains ?? [] }),
            step('employees', 'collect.employees', 2, 0, {
               ...leaders,
               howMany: 10,
            }),
            ...rest.nodes,
            step('csv', 'output.csv', 6, 0),
         ],
         edges: linked([['trigger', 'sites'], ['sites', 'employees'], ...rest.edges, ['list', 'csv']]),
      }
   }

   if (goal === 'newInJob') {
      const rest = tail(['search'], 2, options.icpId, false)

      return {
         nodes: [
            step('trigger', 'trigger.schedule', 0, 0, {
               every: 'week',
               ...(options.timeZone ? { timeZone: options.timeZone } : {}),
            }),
            step('search', 'collect.searchPeople', 1, 0, {
               ...leaders,
               howMany: 25,
               changedJobs: true,
            }),
            ...rest.nodes,
            step('send', 'output.sendApi', 5, 0),
         ],
         edges: linked([['trigger', 'search'], ...rest.edges, ['list', 'send']]),
      }
   }

   if (goal === 'sharedAudience') {
      const rest = tail(['merge'], 5, options.icpId)

      return {
         nodes: [
            step('trigger', 'trigger.manual', 0, 0),
            step('posts', 'input.posts', 1, 0, { howMany: options.posts }),
            step('competitor', 'input.companies', 1, 1, { howMany: 1 }),
            step('theirPosts', 'collect.postsOfCompanies', 2, 1, { howMany: options.posts }),
            step('mine', 'collect.commenters', 2, 0, { howMany: options.perPost }),
            step('theirs', 'collect.commenters', 3, 1, { howMany: options.perPost }),
            step('merge', 'process.merge', 4, 0, { mode: 'every' }),
            ...rest.nodes,
         ],
         edges: linked([
            ['trigger', 'posts'],
            ['trigger', 'competitor'],
            ['posts', 'mine'],
            ['competitor', 'theirPosts'],
            ['theirPosts', 'theirs'],
            ['mine', 'merge'],
            ['theirs', 'merge'],
            ...rest.edges,
         ]),
      }
   }

   const rest = tail(['search'], 2, options.icpId, false)

   return {
      nodes: [
         step('trigger', 'trigger.manual', 0, 0),
         step('search', 'collect.searchPeople', 1, 0, leaders),
         ...rest.nodes,
      ],
      edges: linked([['trigger', 'search'], ...rest.edges]),
   }
}

export const templateGraph = (goal: Goal, options: TemplateOptions): Graph => {
   if (isOwn(goal)) {
      return ownGraph(goal, options)
   }

   if (goal === 'accounts') {
      const rest = tail(['employees'], 3, options.icpId, false)

      return {
         nodes: [
            step('trigger', 'trigger.manual', 0, 0),
            step('companies', 'input.companies', 1, 0, { howMany: options.posts }),
            step('employees', 'collect.employees', 2, 0, {
               howMany: options.perPost,
               titles: options.titles ?? [],
               seniority: LEADERSHIP,
            }),
            ...rest.nodes,
         ],
         edges: linked([['trigger', 'companies'], ['companies', 'employees'], ...rest.edges]),
      }
   }

   const starts: Record<
      Exclude<Goal, 'accounts' | OwnGoal>,
      { nodes: GraphNode[]; edges: string[][]; last: string }
   > = {
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
      competitor: {
         nodes: [
            step('trigger', 'trigger.manual', 0, 0),
            step('competitor', 'input.companies', 1, 0, { howMany: 1 }),
            step('posts', 'collect.postsOfCompanies', 2, 0, { howMany: options.posts }),
         ],
         edges: [
            ['trigger', 'competitor'],
            ['competitor', 'posts'],
         ],
         last: 'posts',
      },
      watch: {
         nodes: [
            step('trigger', 'trigger.schedule', 0, 0, {
               every: 'week',
               ...(options.timeZone ? { timeZone: options.timeZone } : {}),
            }),
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

// A new workflow built from nothing: only "Run by hand".
export const blankGraph = (): Graph => ({
   nodes: [step('trigger', 'trigger.manual', 0, 0)],
   edges: [],
})

export const USE_CASES = {
   leads: 'Find new leads',
   timing: 'Timing signals',
   accounts: 'Account-based',
   monitor: 'Monitor',
} as const

// Lucide icon names; the browser maps them to icons.
export type TemplateIcon =
   | 'MessageSquare'
   | 'Search'
   | 'Building'
   | 'Heart'
   | 'UserRound'
   | 'UserSearch'
   | 'Briefcase'
   | 'Globe'
   | 'Swords'
   | 'Sparkles'
   | 'Merge'

type TemplateInfo = {
   title: string
   summary: string
   icon: TemplateIcon
   useCase: keyof typeof USE_CASES
   needs: string
   gives: string
   // The sizes the cost is worked out for, in words.
   assumes: string
}

const { posts: POSTS, perPost: PER_POST } = TEMPLATE_NUMBERS
const IN_LIST = 'Qualified people in the workflow list'

const TEMPLATES: Record<Goal, TemplateInfo> = {
   engagers: {
      title: 'People engaging with posts I choose',
      summary: 'Commenters and reactors of the posts in your posts list.',
      icon: 'MessageSquare',
      useCase: 'leads',
      needs: 'Posts in your posts list, an ideal customer',
      gives: IN_LIST,
      assumes: `${POSTS} posts, up to ${PER_POST} comments and ${PER_POST} reactions each`,
   },
   problem: {
      title: 'People talking about my problem',
      summary: 'Finds recent posts by keywords, then who engaged with them.',
      icon: 'Search',
      useCase: 'leads',
      needs: 'Keywords, an ideal customer',
      gives: IN_LIST,
      assumes: `${POSTS} posts, up to ${PER_POST} comments and ${PER_POST} reactions each`,
   },
   lookalikes: {
      title: 'People like my best customer',
      summary: 'What your best customer engages with, then who else engaged there.',
      icon: 'Heart',
      useCase: 'leads',
      needs: "Your best customer's profile link, an ideal customer",
      gives: IN_LIST,
      assumes: `${POSTS} comments and ${POSTS} reactions of your customer, ${PER_POST} people on each post`,
   },
   decisionMakers: {
      title: 'Decision makers in my market',
      summary: 'Searches LinkedIn for directors, VPs, C-level and owners, scores them and keeps the best.',
      icon: 'UserSearch',
      useCase: 'leads',
      needs: 'Job titles or keywords, an ideal customer',
      gives: IN_LIST,
      assumes: `${PER_POST} people`,
   },
   competitor: {
      title: "My competitor's audience",
      summary: "Who comments on and reacts to your competitor's company posts.",
      icon: 'Swords',
      useCase: 'leads',
      needs: 'Your competitor in your companies list, an ideal customer',
      gives: IN_LIST,
      assumes: `${POSTS} posts, up to ${PER_POST} comments and ${PER_POST} reactions each`,
   },
   sharedAudience: {
      title: 'Engaged with me and my competitor',
      summary: "Keeps only people who commented on both your posts and your competitor's posts.",
      icon: 'Merge',
      useCase: 'leads',
      needs: 'Posts in your posts list, your competitor in your companies list, an ideal customer',
      gives: IN_LIST,
      assumes: `${POSTS} posts on each side, up to ${PER_POST} comments each`,
   },
   hiring: {
      title: 'Companies hiring for a role',
      summary: 'Finds which of your companies are hiring for a role, then their leaders.',
      icon: 'Briefcase',
      useCase: 'timing',
      needs: 'Companies in your companies list, a job title, an ideal customer',
      gives: IN_LIST,
      assumes: `${POSTS * 4} companies, 25 leaders at each`,
   },
   newInJob: {
      title: 'New in their job',
      summary: 'Each week, decision makers who just changed jobs, sent to your system too.',
      icon: 'Sparkles',
      useCase: 'timing',
      needs: 'Job titles or keywords, an ideal customer, your address for Send via API',
      gives: 'Qualified people in the list and sent to your address, every week',
      assumes: '25 people a run',
   },
   accounts: {
      title: 'Who works at my target accounts',
      summary: 'The leaders at the companies in your companies list.',
      icon: 'Building',
      useCase: 'accounts',
      needs: 'Companies in your companies list, an ideal customer',
      gives: IN_LIST,
      assumes: `${POSTS} companies, ${PER_POST} leaders at each`,
   },
   websites: {
      title: 'From a list of websites',
      summary: 'Turns website addresses into companies, then finds their leaders.',
      icon: 'Globe',
      useCase: 'accounts',
      needs: 'Website addresses, an ideal customer',
      gives: 'Qualified people in the list and a CSV file',
      assumes: '10 websites, 10 leaders at each',
   },
   watch: {
      title: 'Watch people I care about',
      summary: 'Each week, new posts of people in your profiles list and who engaged.',
      icon: 'UserRound',
      useCase: 'monitor',
      needs: 'People in your profiles list, an ideal customer',
      gives: IN_LIST,
      assumes: `${POSTS} people, 3 posts each, up to ${PER_POST} comments and ${PER_POST} reactions per post`,
   },
}

// Example inputs, so the cost counts what a user would fill in on the canvas.
const PRICED_WITH: TemplateOptions = {
   ...TEMPLATE_NUMBERS,
   keywords: 'example',
   jobTitle: 'example',
   domains: Array.from({ length: 10 }, (_, index) => `site-${index + 1}.com`),
}
const FULL_LISTS: Available = {
   posts: Number.MAX_SAFE_INTEGER,
   profiles: Number.MAX_SAFE_INTEGER,
   companies: Number.MAX_SAFE_INTEGER,
}

// The templates as plain data for the browser, with what one run costs at most at the starting sizes.
export const templateCatalog = () =>
   GOALS.map(id => ({
      id,
      ...TEMPLATES[id],
      useCaseLabel: USE_CASES[TEMPLATES[id].useCase],
      costMicros: estimateGraph(templateGraph(id, PRICED_WITH), FULL_LISTS).totalMicros,
   }))

// The schedule of a graph, or null when it is started by hand.
export const scheduleOf = (graph: Graph): Schedule | null => {
   const node = graph.nodes.find(({ type }) => type === 'trigger.schedule')

   return node ? scheduleSchema.parse(node.config) : null
}

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

const HOUR_MS = 3_600_000

const isWeekday = (day: number) => day >= 1 && day <= 5

const daysOf = (schedule: Schedule) => (schedule.days.length > 0 ? schedule.days.map(Number) : [schedule.weekday])

// Whether the schedule may start on this calendar day (a UTC midnight standing for the day in the schedule's zone).
const runsOn = (schedule: Schedule, day: Date) => {
   const weekday = day.getUTCDay()

   switch (schedule.every) {
      case 'weekdays':
         return isWeekday(weekday)
      case 'week':
         return daysOf(schedule).includes(weekday)
      case 'month':
         return day.getUTCDate() === schedule.dayOfMonth
      case 'hours':
         return !schedule.weekdaysOnly || isWeekday(weekday)
      default:
         return true
   }
}

const dayAfter = (day: Date, offset: number) =>
   new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + offset))

const startOn = (day: Date, time: string, timeZone: string) => {
   const [hour, minute] = time.split(':').map(Number)

   return zonedToUtc(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute), timeZone)
}

// Every few hours, kept inside the allowed days and the "only between" window: a start outside them moves to the
// next opening.
const nextEveryFewHours = (schedule: Schedule, after: Date) => {
   const candidate = new Date(after.getTime() + schedule.hours * HOUR_MS)

   if (!schedule.between && !schedule.weekdaysOnly) {
      return candidate
   }

   const wall = new Date(wallClock(candidate, schedule.timeZone))
   const time = wall.toISOString().slice(11, 16)
   const inWindow = !schedule.between || (time >= schedule.from && time < schedule.until)

   if (inWindow && runsOn(schedule, wall)) {
      return candidate
   }

   for (let offset = 0; offset <= 8; offset += 1) {
      const day = dayAfter(wall, offset)
      const opening = startOn(day, schedule.between ? schedule.from : '00:00', schedule.timeZone)

      if (opening > candidate && runsOn(schedule, day)) {
         return opening
      }
   }

   return candidate
}

// The first start of the schedule strictly after `after`.
export const nextScheduledRun = (schedule: Schedule, after: Date): Date => {
   if (schedule.every === 'hours') {
      return nextEveryFewHours(schedule, after)
   }

   const today = new Date(wallClock(after, schedule.timeZone))

   // Two months covers every monthly day; the other repeats find a day within a week.
   for (let offset = 0; offset <= 62; offset += 1) {
      const day = dayAfter(today, offset)
      const candidate = startOn(day, schedule.at, schedule.timeZone)

      if (runsOn(schedule, day) && candidate > after) {
         return candidate
      }
   }

   return new Date(after.getTime() + 7 * 24 * HOUR_MS)
}

// The next few starts, to show the owner what the schedule means.
export const nextScheduledRuns = (schedule: Schedule, after: Date, count: number) => {
   const runs: Date[] = []
   let last = after

   for (let index = 0; index < count; index += 1) {
      last = nextScheduledRun(schedule, last)
      runs.push(last)
   }

   return runs
}
