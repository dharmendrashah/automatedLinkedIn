import { z } from 'zod'

import { CAMPAIGN_LIMITS, campaignLabelOf } from './campaign'
import { type RecipeWorkflow, recipeParts } from './recipes'
import { templateProblems } from './template'
import { type Graph, type NodeConfig } from './workflow'

// The automations (.plan/lead-pipeline-p10-automations.md): finders and loops built from the blocks of phases 1 to 9, as pure descriptions
// like the Starter's recipe. Every workflow they make is switched off with "Act for real" off. Sixteen are planned; the ones whose blocks
// do not exist yet say what they wait for, so nobody is offered a graph that cannot work.

const { node, wire, presetOf, profiles } = recipeParts

type Wiring = Array<[string, string] | [string, string, 'else']>

export type AutomationId =
   'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9' | 'A10' | 'A11' | 'A12' | 'A13' | 'A14' | 'A15' | 'A16'

export type AutomationInfo = {
   id: AutomationId
   wave: 1 | 2 | 3
   title: string
   summary: string
   // Built here, or the one thing it still waits for.
   waitsFor: string | null
}

export const AUTOMATIONS: AutomationInfo[] = [
   {
      id: 'A1',
      wave: 1,
      title: 'Intent radar',
      summary:
         'Every few hours, finds posts that ask for a tool, complain or compare, labels them with AI, and takes the people behind them.',
      waitsFor: null,
   },
   {
      id: 'A2',
      wave: 1,
      title: 'Buying committee builder',
      summary: 'Finds buyers, champions and users at your target companies and keeps the best few of each company.',
      waitsFor: 'People at companies from a saved list of target companies, and Top N on companies.',
   },
   {
      id: 'A8',
      wave: 1,
      title: 'Content flywheel',
      summary: 'Writes a weekly post from your topics and invites the people who engage with it.',
      waitsFor: 'Write words for posts from topics, and Write a post taking words from the block before it.',
   },
   {
      id: 'A15',
      wave: 1,
      title: 'Closed loop with other channels',
      summary: 'Stops contacting people who answered in another tool, from a call that carries the outcome.',
      waitsFor: 'An outcome field on When called by API.',
   },
   {
      id: 'A16',
      wave: 1,
      title: 'Experiment engine',
      summary: 'Splits what reaches a block into two labelled groups so two openers can be compared.',
      waitsFor: null,
   },
   {
      id: 'A3',
      wave: 2,
      title: 'Trigger-based account engine',
      summary: 'Watches target companies for hiring or funding and starts the buying committee builder for them.',
      waitsFor: 'Add label on companies.',
   },
   {
      id: 'A4',
      wave: 2,
      title: 'Job-post tool detector',
      summary: 'Reads job texts of target companies for the tools or pains you look for.',
      waitsFor: 'Label with AI reading a job text.',
   },
   {
      id: 'A5',
      wave: 2,
      title: 'Customer lookalike graph',
      summary: 'Finds the pattern in your customers and searches for people who look like them.',
      waitsFor: 'Search people from an ideal customer.',
   },
   {
      id: 'A7',
      wave: 2,
      title: 'Shared-context notes',
      summary: 'Adds a shared school or employer to the note when there is one.',
      waitsFor: 'Compare with my account, and a read of the account\u2019s own profile.',
   },
   {
      id: 'A12',
      wave: 2,
      title: 'Reactivation engine',
      summary: 'Writes again to dormant connections who changed roles.',
      waitsFor: 'Two stored reads of a profile to compare, and words written by AI for messages.',
   },
   {
      id: 'A13',
      wave: 2,
      title: 'Inbound capture',
      summary:
         'Takes the people who viewed you, engaged with you or accepted you, scores them and invites the ones you have not met.',
      waitsFor: null,
   },
   {
      id: 'A6',
      wave: 3,
      title: 'Warm path finder',
      summary: 'Mentions a mutual connection in the note to your best people.',
      waitsFor: 'The mutual connections read, and words written by AI for invites.',
   },
   {
      id: 'A9',
      wave: 3,
      title: 'Competitor displacement',
      summary: 'Finds people who engage with a competitor or used to work there and tests two openers.',
      waitsFor: 'Search people by a former employer.',
   },
   {
      id: 'A10',
      wave: 3,
      title: 'Events and community harvest',
      summary:
         'Finds posts about your events and communities, labels who is a speaker or organiser and takes the people.',
      waitsFor: null,
   },
   {
      id: 'A11',
      wave: 3,
      title: 'Second-degree expansion',
      summary: 'Watches the posts of your best connections and takes the people they engage with.',
      waitsFor: null,
   },
   {
      id: 'A14',
      wave: 3,
      title: 'Referral loop',
      summary: 'Asks your connected customers, once a month, who else should hear about you.',
      waitsFor: null,
   },
]

export const AUTOMATION_IDS = AUTOMATIONS.map(({ id }) => id)

export const isAutomationId = (value: string): value is AutomationId => AUTOMATIONS.some(({ id }) => id === value)

// ---------------------------------------------------------------------------------------------------------------------------------
// The questions. One form for all of them; each automation checks the ones it needs.

const phrase = z
   .string()
   .trim()
   .min(3, 'A phrase has at least 3 characters.')
   .max(100, 'A phrase has up to 100 characters.')

export const automationAnswersSchema = z
   .object({
      name: z.string().trim().min(1, 'Name the automation.').max(CAMPAIGN_LIMITS.nameMax),
      icpId: z.string().trim().min(1, 'Pick a saved ideal customer.').max(100),
      phrases: z.array(phrase).max(8).default([]),
      accounts: z
         .object({
            mode: z.enum(['all', 'pick']).default('all'),
            ids: z.array(z.string().min(1).max(100)).max(20).default([]),
         })
         .default({
            mode: 'all',
            ids: [],
         }),
      note: z.string().trim().max(200, 'A note has up to 200 characters.').default(''),
      message: z.string().trim().max(4000).default(''),
      customersLabel: z.string().trim().toLowerCase().min(1).max(30).default('customer'),
      when: z
         .object({
            time: z
               .string()
               .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Write a time like 09:00.')
               .default('09:00'),
            timeZone: z.string().trim().min(1).max(64).default('UTC'),
         })
         .default({
            time: '09:00',
            timeZone: 'UTC',
         }),
   })
   .superRefine((answers, context) => {
      if (answers.accounts.mode === 'pick' && answers.accounts.ids.length === 0) {
         context.addIssue({
            code: 'custom',
            path: ['accounts'],
            message: 'Pick at least one account.',
         })
      }

      for (const [path, text, maxChars] of [
         ['note', answers.note, 200],
         ['message', answers.message, 4000],
      ] as Array<[string, string, number]>) {
         for (const message of templateProblems(text, { maxChars })) {
            context.addIssue({
               code: 'custom',
               path: [path],
               message,
            })
         }
      }
   })

export type AutomationAnswers = z.input<typeof automationAnswersSchema>

// What the form still lacks for this automation, in plain words; none when it is ready to build.
export const automationProblems = (id: AutomationId, input: AutomationAnswers): string[] => {
   const answers = automationAnswersSchema.parse(input)

   return [
      ...(['A1', 'A10'].includes(id) && answers.phrases.length === 0 ? ['Add at least one phrase.'] : []),
      ...(id === 'A14' && answers.message === '' ? ['Write the message to your customers.'] : []),
   ]
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Shared parts.

const accountsNode = (answers: z.output<typeof automationAnswersSchema>, id: string, column: number, row: number) =>
   node(
      id,
      'account.select',
      column,
      row,
      answers.accounts.mode === 'pick'
         ? {
              scope: 'pick',
              accounts: answers.accounts.ids,
           }
         : { scope: 'all' }
   )

const scheduleNode = (answers: z.output<typeof automationAnswersSchema>, at: string, extra: NodeConfig = {}) =>
   node('trigger', 'trigger.schedule', 0, 0, {
      every: 'day',
      at,
      timeZone: answers.when.timeZone,
      ...extra,
   })

// The tail every finder ends with: leave out people already known and customers, rank them by signals, read the profiles of the ones worth
// it, rank again with the profile, label and keep. Tier D is left out of the profile read.
const tail = (
   answers: z.output<typeof automationAnswersSchema>,
   label: string,
   extraTags: string[],
   column: number
) => ({
   nodes: [
      node('tailDedupe', 'process.dedupe', column, 0, { skipCompanyLabel: answers.customersLabel }),
      node('tailScore', 'score.signals', column + 1, 0, {
         icpId: answers.icpId,
         keepTierD: false,
      }),
      node('tailProfile', 'collect.profile', column + 2, 0),
      node('tailScore2', 'score.signals', column + 3, 0, {
         icpId: answers.icpId,
         keepTierD: false,
      }),
      node('tailLabel', 'process.tag', column + 4, 0, { tags: [label, ...extraTags] }),
      node('tailList', 'output.list', column + 5, 0),
   ],
   edges: [
      ['tailDedupe', 'tailScore'],
      ['tailScore', 'tailProfile'],
      ['tailProfile', 'tailScore2'],
      ['tailScore2', 'tailLabel'],
      ['tailLabel', 'tailList'],
   ] as Wiring,
})

const named = (answers: z.output<typeof automationAnswersSchema>, title: string, graph: Graph): RecipeWorkflow => ({
   stage: 'OTHER',
   name: `${answers.name} \u00b7 ${title}`,
   graph,
})

// ---------------------------------------------------------------------------------------------------------------------------------
// A16 Experiment engine: a stable share of what reaches it goes to one side, the rest to the other, and each is labelled. The owner draws a
// line from `expA` and `expB` to the two versions of what is sent.

export const experimentParts = (after: string, percent = 50, column = 0, row = 0) => ({
   nodes: [
      node('expSplit', 'logic.split', column, row, { percent }),
      node('expA', 'process.tag', column + 1, row, { tags: ['variant-a'] }),
      node('expB', 'process.tag', column + 1, row + 1, { tags: ['variant-b'] }),
   ],
   edges: [
      [after, 'expSplit'],
      ['expSplit', 'expA'],
      ['expSplit', 'expB', 'else'],
   ] as Wiring,
})

// ---------------------------------------------------------------------------------------------------------------------------------
// A1 Intent radar.

const INTENT_LABELS = [
   'asking: Asks for a tool or advice',
   'complaint: Complains about the problem',
   'switching: Compares tools or says they are leaving one',
   'hiring: Announces a hire for the role',
   'funding: Announces funding or growth',
]

const intentRadar = (answers: z.output<typeof automationAnswersSchema>): RecipeWorkflow[] => {
   const label = campaignLabelOf(answers.name)
   const parts = tail(answers, label, ['src-intent'], 9)
   const finds = answers.phrases.map((keywords, at) =>
      node(`find${at}`, 'collect.findPosts', 1, at, {
         keywords,
         howMany: 10,
         postedWithin: '24h',
         keep: true,
      })
   )

   return [
      named(answers, 'Intent radar', {
         nodes: [
            scheduleNode(answers, '08:00', {
               every: 'hours',
               hours: 3,
               between: true,
               from: '08:00',
               until: '20:00',
            }),
            ...finds,
            node('posts', 'process.dedupe', 2, 0),
            node('classify', 'process.classify', 3, 0, {
               labels: INTENT_LABELS,
               read: 'post',
               minConfidence: 70,
               atMost: 100,
            }),
            node('urgent', 'logic.ifEvent', 4, 0, {
               match: 'any',
               fact: 'item.label',
               is: 'is',
               value: 'asking',
               fact2: 'item.label',
               is2: 'is',
               value2: 'switching',
            }),
            node('authors', 'collect.profile', 5, 0),
            node('urgentTag', 'process.tag', 6, 0, { tags: ['urgent'] }),
            node('commenters', 'collect.commenters', 5, 2, { howMany: 30 }),
            node('reactors', 'collect.reactors', 5, 3, { howMany: 30 }),
            ...parts.nodes,
            node('done', 'output.markPosts', 3, 5),
         ],
         edges: wire([
            ...finds.map((each): [string, string] => ['trigger', each.id]),
            ...finds.map((each): [string, string] => [each.id, 'posts']),
            ['posts', 'classify'],
            ['classify', 'urgent'],
            ['urgent', 'authors'],
            ['authors', 'urgentTag'],
            ['urgentTag', 'tailDedupe'],
            ['urgent', 'commenters', 'else'],
            ['urgent', 'reactors', 'else'],
            ['classify', 'commenters', 'else'],
            ['classify', 'reactors', 'else'],
            ['commenters', 'tailDedupe'],
            ['reactors', 'tailDedupe'],
            ...parts.edges,
            ['posts', 'done'],
         ]),
      }),
   ]
}

// ---------------------------------------------------------------------------------------------------------------------------------
// A10 Events and community harvest.

const COMMUNITY_LABELS = [
   'speaker: Speaks at or presents in the event',
   'attendee: Went to or is going to the event',
   'organiser: Runs or hosts the event or community',
   'other: Talks about it without a role',
]

const communityHarvest = (answers: z.output<typeof automationAnswersSchema>): RecipeWorkflow[] => {
   const label = campaignLabelOf(answers.name)
   const parts = tail(answers, label, ['src-community'], 9)
   const finds = answers.phrases.map((keywords, at) =>
      node(`find${at}`, 'collect.findPosts', 1, at, {
         keywords,
         howMany: 20,
         postedWithin: 'month',
         keep: true,
      })
   )

   return [
      named(answers, 'Events and community', {
         nodes: [
            scheduleNode(answers, answers.when.time, {
               every: 'week',
               weekday: 1,
            }),
            ...finds,
            node('posts', 'process.dedupe', 2, 0),
            node('classify', 'process.classify', 3, 0, {
               labels: COMMUNITY_LABELS,
               read: 'post',
               minConfidence: 70,
               atMost: 100,
            }),
            node('host', 'logic.ifEvent', 4, 0, {
               match: 'any',
               fact: 'item.label',
               is: 'is',
               value: 'speaker',
               fact2: 'item.label',
               is2: 'is',
               value2: 'organiser',
            }),
            node('authors', 'collect.profile', 5, 0),
            node('hostTag', 'process.tag', 6, 0, { tags: ['host'] }),
            node('commenters', 'collect.commenters', 3, 2, { howMany: 30 }),
            ...parts.nodes,
            node('done', 'output.markPosts', 3, 4),
         ],
         edges: wire([
            ...finds.map((each): [string, string] => ['trigger', each.id]),
            ...finds.map((each): [string, string] => [each.id, 'posts']),
            ['posts', 'classify'],
            ['classify', 'host'],
            ['host', 'authors'],
            ['authors', 'hostTag'],
            ['hostTag', 'tailDedupe'],
            ['posts', 'commenters'],
            ['commenters', 'tailDedupe'],
            ...parts.edges,
            ['posts', 'done'],
         ]),
      }),
   ]
}

// ---------------------------------------------------------------------------------------------------------------------------------
// A11 Second-degree expansion.

const secondDegree = (answers: z.output<typeof automationAnswersSchema>): RecipeWorkflow[] => {
   const label = campaignLabelOf(answers.name)
   const parts = tail(answers, label, ['src-second-degree'], 7)

   return [
      named(answers, 'Second-degree expansion', {
         nodes: [
            scheduleNode(answers, answers.when.time, {
               every: 'week',
               weekday: 2,
            }),
            node(
               'people',
               'input.profiles',
               1,
               0,
               profiles(
                  {
                     howMany: 25,
                     order: 'score',
                  },
                  { connection: 'CONNECTED' }
               )
            ),
            node('posts', 'collect.postsOfPeople', 2, 0, {
               howMany: 3,
               postedWithin: 'week',
            }),
            node('commenters', 'collect.commenters', 3, 0, { howMany: 30 }),
            node('reactors', 'collect.reactors', 3, 1, { howMany: 30 }),
            node('state', 'logic.ifPerson', 4, 0, presetOf('logic.ifPerson', 'Not connected')),
            ...parts.nodes,
         ],
         edges: wire([
            ['trigger', 'people'],
            ['people', 'posts'],
            ['posts', 'commenters'],
            ['posts', 'reactors'],
            ['commenters', 'state'],
            ['reactors', 'state'],
            ['state', 'tailDedupe'],
            ...parts.edges,
         ]),
      }),
   ]
}

// ---------------------------------------------------------------------------------------------------------------------------------
// A13 Inbound capture.

const inboundCapture = (answers: z.output<typeof automationAnswersSchema>): RecipeWorkflow[] => [
   named(answers, 'Inbound capture', {
      nodes: [
         scheduleNode(answers, '08:00', {
            every: 'hours',
            hours: 4,
            between: true,
            from: '08:00',
            until: '20:00',
         }),
         node('notes', 'account.getNotifications', 1, 0, {
            since: '24h',
            kinds: ['viewed', 'engaged', 'accepted', 'life'],
         }),
         node('viewers', 'account.getViewers', 1, 1, { since: '24h' }),
         node('merge', 'process.merge', 2, 0),
         node('dedupe', 'process.dedupe', 3, 0, { skipCompanyLabel: answers.customersLabel }),
         node('score', 'score.signals', 4, 0, {
            icpId: answers.icpId,
            model: 'intentFirst',
         }),
         node('state', 'logic.ifPerson', 5, 0, presetOf('logic.ifPerson', 'Not connected')),
         accountsNode(answers, 'accounts', 6, 0),
         node('room', 'process.room', 7, 0, { action: 'invite' }),
         node('send', 'account.sendInvite', 8, 0, {
            note: answers.note,
            planDays: 1,
         }),
      ],
      edges: wire([
         ['trigger', 'notes'],
         ['trigger', 'viewers'],
         ['notes', 'merge'],
         ['viewers', 'merge'],
         ['merge', 'dedupe'],
         ['dedupe', 'score'],
         ['score', 'state'],
         ['state', 'accounts'],
         ['accounts', 'room'],
         ['room', 'send'],
      ]),
   }),
]

// ---------------------------------------------------------------------------------------------------------------------------------
// A14 Referral loop.

const referralLoop = (answers: z.output<typeof automationAnswersSchema>): RecipeWorkflow[] => [
   named(answers, 'Referral loop', {
      nodes: [
         scheduleNode(answers, answers.when.time, {
            every: 'month',
            dayOfMonth: 1,
         }),
         node(
            'people',
            'input.profiles',
            1,
            0,
            profiles(
               {
                  howMany: 50,
                  labels: [answers.customersLabel],
               },
               { connection: 'CONNECTED' }
            )
         ),
         node('chat', 'collect.chat', 2, 0),
         node('quiet', 'logic.ifPerson', 3, 0, presetOf('logic.ifPerson', 'Never messaged')),
         accountsNode(answers, 'accounts', 4, 0),
         node('room', 'process.room', 5, 0, { action: 'message' }),
         node('send', 'account.sendMessage', 6, 0, {
            text: answers.message,
            skipMissing: true,
         }),
      ],
      edges: wire([
         ['trigger', 'people'],
         ['people', 'chat'],
         ['chat', 'quiet'],
         ['quiet', 'accounts'],
         ['accounts', 'room'],
         ['room', 'send'],
      ]),
   }),
]

const BUILDERS: Partial<Record<AutomationId, (answers: z.output<typeof automationAnswersSchema>) => RecipeWorkflow[]>> =
   {
      A1: intentRadar,
      A10: communityHarvest,
      A11: secondDegree,
      A13: inboundCapture,
      A14: referralLoop,
   }

// The workflows of an automation, switched off. An automation that waits for a block builds nothing.
export const buildAutomation = (id: AutomationId, input: AutomationAnswers): RecipeWorkflow[] => {
   const answers = automationAnswersSchema.parse(input)
   const build = BUILDERS[id]

   if (!build) {
      return []
   }

   const problems = automationProblems(id, input)

   if (problems.length > 0) {
      throw new Error(problems.join(' '))
   }

   return build(answers)
}
