import { z } from 'zod'

import { CAMPAIGN_LIMITS, type CampaignStage, campaignLabelOf } from './campaign'
import { PLATFORM_MAX } from './limits'
import { templateProblems } from './template'
import { type Graph, type GraphNode, type NodeConfig, blockOf } from './workflow'

// The Starter (.plan/lead-pipeline-p6-campaign-starter.md): a recipe is a pure description that turns a few answers into a campaign and
// its workflows, so a founder sets the pipeline up with one form and a GTM engineer can still open every block. A recipe creates workflows
// that are switched off with "Act for real" off, and nothing in an answer is a threshold or a block name.

export type RecipeWorkflow = { stage: CampaignStage; name: string; graph: Graph }

export type RecipeBuild = {
   campaign: { name: string; label: string }
   workflows: RecipeWorkflow[]
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Engage-first outreach: find people who post about the problem, invite them, warm them up, message the ones who accept, hand off the rest.

const phrase = z
   .string()
   .trim()
   .min(3, 'A phrase has at least 3 characters.')
   .max(100, 'A phrase has up to 100 characters.')
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Write a time like 09:00.')
const list = (max: number) => z.array(z.string().trim().min(1).max(100)).max(max).default([])

export const outreachAnswersSchema = z
   .object({
      name: z.string().trim().min(1, 'Name the campaign.').max(CAMPAIGN_LIMITS.nameMax),
      phrases: z.array(phrase).min(1, 'Add at least one phrase.').max(5),
      customer: z
         .object({
            icpId: z.string().max(100).default(''),
            includeTitles: list(20),
            seniorities: list(10),
            industries: list(20),
            companySizes: list(10),
            locations: list(20),
         })
         .default({
            icpId: '',
            includeTitles: [],
            seniorities: [],
            industries: [],
            companySizes: [],
            locations: [],
         }),
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
      message: z.string().trim().min(1, 'Write the first message.').max(4000),
      warmUp: z
         .object({
            reactions: z.boolean().default(true),
            comments: z.enum(['off', 'texts']).default('off'),
            texts: z.array(z.string().trim().min(1).max(1250)).max(20).default([]),
         })
         .default({
            reactions: true,
            comments: 'off',
            texts: [],
         }),
      when: z
         .object({
            time: clock.default('09:00'),
            timeZone: z.string().trim().min(1).max(64).default('UTC'),
         })
         .default({
            time: '09:00',
            timeZone: 'UTC',
         }),
      handOffUrl: z.string().trim().max(500).default(''),
      postsPerDay: z.number().int().min(1).max(50).default(8),
   })
   .superRefine((answers, context) => {
      if (answers.customer.icpId === '' && answers.customer.includeTitles.length === 0) {
         context.addIssue({
            code: 'custom',
            path: ['customer'],
            message: 'Add at least one job title, or pick a saved ideal customer.',
         })
      }

      if (answers.accounts.mode === 'pick' && answers.accounts.ids.length === 0) {
         context.addIssue({
            code: 'custom',
            path: ['accounts'],
            message: 'Pick at least one account.',
         })
      }

      if (answers.warmUp.comments === 'texts' && answers.warmUp.texts.length === 0) {
         context.addIssue({
            code: 'custom',
            path: ['warmUp'],
            message: 'Write at least one comment text, or turn comments off.',
         })
      }

      for (const [path, text, maxChars] of [
         ['note', answers.note, 200],
         ['message', answers.message, 4000],
         ...answers.warmUp.texts.map((each): [string, string, number] => ['warmUp', each, 1250]),
      ] as Array<[string, string, number]>) {
         for (const message of templateProblems(text, { maxChars })) {
            context.addIssue({
               code: 'custom',
               path: [path],
               message,
            })
         }
      }

      if (answers.handOffUrl !== '' && !answers.handOffUrl.startsWith('https://')) {
         context.addIssue({
            code: 'custom',
            path: ['handOffUrl'],
            message: 'The address must start with https://.',
         })
      }
   })

export type OutreachAnswers = z.input<typeof outreachAnswersSchema>

// What each step of the funnel is assumed to give (measure in week one).
const PEOPLE_PER_POST = 15
const QUALIFIED_PER_POST = 7
// The share of its platform limit an account is held to: a seeded 65 to 80 percent (see the limits module).
const SHARE = {
   low: 0.65,
   high: 0.8,
} as const

// How many invites the accounts can send a day, and how many posts a day it takes to fill that: the weekly limit is the tighter one.
export const capacityOf = (accounts: number, postsPerDay: number) => {
   const perAccount = Math.min(PLATFORM_MAX.invitesPerDay, PLATFORM_MAX.invitesPerWeek / 7)
   const low = Math.floor(accounts * perAccount * SHARE.low)
   const high = Math.floor(accounts * perAccount * SHARE.high)
   const found = postsPerDay * PEOPLE_PER_POST

   return {
      invitesLow: low,
      invitesHigh: high,
      found,
      suggestedPosts: Math.min(50, Math.max(1, Math.ceil(high / QUALIFIED_PER_POST))),
      sentence:
         accounts === 0
            ? 'No account is signed in, so nothing can be sent yet. You can still create the campaign.'
            : `${accounts} ${accounts === 1 ? 'account' : 'accounts'} can send about ${low} to ${high} invites a day. At ${postsPerDay} posts a day you will find about ${found} people a day${
                 found > high
                    ? ', more than you can invite, so only the best are invited.'
                    : ', fewer than you can invite.'
              }`,
   }
}

const shift = (time: string, hours: number) => {
   const [hour = 0, minute = 0] = time.split(':').map(Number)
   const total = (((hour * 60 + minute + hours * 60) % 1440) + 1440) % 1440

   return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const node = (
   id: string,
   type: GraphNode['type'],
   column: number,
   row: number,
   config: NodeConfig = {}
): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: column * 280,
      y: row * 140,
   },
})

const wire = (pairs: Array<[string, string] | [string, string, 'else']>): Graph['edges'] =>
   pairs.map(([from, to, port]) => ({
      from,
      to,
      ...(port && { fromPort: port }),
   }))

const presetOf = (type: GraphNode['type'], label: string): NodeConfig =>
   blockOf(type).presets?.find(each => each.label === label)?.config ?? {}

const profiles = (config: NodeConfig, filters: object) =>
   ({
      source: 'network',
      filters: JSON.stringify(filters),
      ...config,
   }) satisfies NodeConfig

// The small builders every recipe uses, shared with the automations.
export const recipeParts = {
   node,
   wire,
   shift,
   presetOf,
   profiles,
}

// The recipe: six workflows, switched off, in the order a person moves through them.
export const buildOutreach = (input: OutreachAnswers, icpId: string, discoverId?: string): RecipeBuild => {
   const answers = outreachAnswersSchema.parse(input)
   const label = campaignLabelOf(answers.name)
   const { time, timeZone } = answers.when
   const schedule = (at: string, extra: NodeConfig = {}) =>
      node('trigger', 'trigger.schedule', 0, 0, {
         every: 'day',
         at,
         timeZone,
         ...extra,
      })
   const accounts = (id: string, column: number, row: number) =>
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
   const perPhrase = Math.max(1, Math.ceil(answers.postsPerDay / answers.phrases.length))

   // 1 Discover: posts about the problem, their commenters and reactors, scored, kept with the campaign label.
   const finds = answers.phrases.map((keywords, at) =>
      node(`find${at}`, 'collect.findPosts', 1, at, {
         keywords,
         howMany: perPhrase,
         postedWithin: '24h',
         keep: true,
      })
   )
   const discover: Graph = {
      nodes: [
         schedule(time),
         ...finds,
         node('posts', 'process.dedupe', 2, 0),
         node('commenters', 'collect.commenters', 3, 0, { howMany: 50 }),
         node('reactors', 'collect.reactors', 3, 1, { howMany: 50 }),
         node('people', 'process.dedupe', 4, 0),
         node('profile', 'collect.profile', 5, 0, {
            readLimit: 200,
            reread: false,
         }),
         node('score', 'score.icp', 6, 0, { icpId }),
         node('label', 'process.tag', 7, 0, { tags: [label] }),
         node('list', 'output.list', 8, 0),
         node('done', 'output.markPosts', 3, 3),
      ],
      edges: wire([
         ...finds.map((each): [string, string] => ['trigger', each.id]),
         ...finds.map((each): [string, string] => [each.id, 'posts']),
         ['posts', 'commenters'],
         ['posts', 'reactors'],
         ['commenters', 'people'],
         ['reactors', 'people'],
         ['people', 'profile'],
         ['profile', 'score'],
         ['score', 'label'],
         ['label', 'list'],
         ['posts', 'done'],
      ]),
   }

   // 2 Invite: the newest qualified people who are not connected yet, inside today's limit; the best carry the note.
   // With Discover's id it starts when Discover finishes; without one it keeps its clock time.
   const invite = (id: string, column: number, row: number, note: string) =>
      node(id, 'account.sendInvite', column, row, {
         note,
         planDays: 1,
      })
   const inviteStart =
      discoverId === undefined
         ? schedule(shift(time, 1))
         : node('trigger', 'trigger.workflow', 0, 0, { workflowId: discoverId })
   const inviteGraph: Graph =
      answers.note === ''
         ? {
              nodes: [
                 inviteStart,
                 node(
                    'people',
                    'input.profiles',
                    1,
                    0,
                    profiles(
                       {
                          howMany: 100,
                          added: 'any',
                          order: 'newest',
                       },
                       {
                          labels: [label],
                          invites: ['NONE'],
                       }
                    )
                 ),
                 node('state', 'logic.ifPerson', 2, 0, presetOf('logic.ifPerson', 'Not connected')),
                 accounts('accounts', 3, 0),
                 node('room', 'process.room', 4, 0, { action: 'invite' }),
                 invite('send', 5, 0, ''),
              ],
              edges: wire([
                 ['trigger', 'people'],
                 ['people', 'state'],
                 ['state', 'accounts'],
                 ['accounts', 'room'],
                 ['room', 'send'],
              ]),
           }
         : {
              nodes: [
                 inviteStart,
                 node(
                    'people',
                    'input.profiles',
                    1,
                    0,
                    profiles(
                       {
                          howMany: 100,
                          added: 'any',
                          order: 'newest',
                       },
                       {
                          labels: [label],
                          invites: ['NONE'],
                       }
                    )
                 ),
                 node('state', 'logic.ifPerson', 2, 0, presetOf('logic.ifPerson', 'Not connected')),
                 accounts('accounts', 3, 0),
                 node('room', 'process.room', 4, 0, { action: 'invite' }),
                 node('best', 'logic.if', 5, 0, { minScore: 70 }),
                 invite('withNote', 6, 0, answers.note),
                 invite('withoutNote', 6, 1, ''),
              ],
              edges: wire([
                 ['trigger', 'people'],
                 ['people', 'state'],
                 ['state', 'accounts'],
                 ['accounts', 'room'],
                 ['room', 'best'],
                 ['best', 'withNote'],
                 ['best', 'withoutNote', 'else'],
              ]),
           }

   // 3 Warm up: react to the posts of people whose invite is pending, 90 percent of them; the rest is the control group.
   const warmNodes: GraphNode[] = [
      schedule(shift(time, 5)),
      node(
         'people',
         'input.profiles',
         1,
         0,
         profiles(
            {
               howMany: 50,
               dateField: 'lastEngaged',
               order: 'oldest',
            },
            {
               labels: [label],
               invites: ['PENDING'],
            }
         )
      ),
      node('split', 'logic.split', 2, 0, { percent: 90 }),
      node('control', 'process.tag', 2, 1, { tags: ['control'] }),
      accounts('accounts', 3, 0),
      node('posts', 'collect.postsOfPeople', 4, 0, {
         howMany: 1,
         postedWithin: 'week',
      }),
   ]
   const warmEdges: Array<[string, string] | [string, string, 'else']> = [
      ['trigger', 'people'],
      ['people', 'split'],
      ['split', 'control', 'else'],
      ['split', 'accounts'],
      ['accounts', 'posts'],
   ]

   if (answers.warmUp.reactions) {
      warmNodes.push(
         node('reactRoom', 'process.room', 5, 0, { action: 'reaction' }),
         node('react', 'account.reactToPost', 6, 0, { reactions: ['like', 'insightful'] })
      )
      warmEdges.push(['posts', 'reactRoom'], ['reactRoom', 'react'])
   }

   if (answers.warmUp.comments === 'texts') {
      warmNodes.push(
         node('commentRoom', 'process.room', 5, 2, { action: 'comment' }),
         node('write', 'process.write', 6, 2, {
            how: 'texts',
            texts: answers.warmUp.texts,
         }),
         node('ask', 'logic.approve', 7, 2),
         node('approved', 'trigger.approved', 0, 4, { what: 'COMMENT' }),
         accounts('commentAccounts', 1, 4),
         node('approvedRoom', 'process.room', 2, 4, { action: 'comment' }),
         node('comment', 'account.commentOnPost', 3, 4)
      )
      warmEdges.push(
         ['posts', 'commentRoom'],
         ['commentRoom', 'write'],
         ['write', 'ask'],
         ['approved', 'commentAccounts'],
         ['commentAccounts', 'approvedRoom'],
         ['approvedRoom', 'comment']
      )
   }

   // 4 First message: connected people nobody has written to, after a wait, inside today's limit.
   const message: Graph = {
      nodes: [
         schedule(time, {
            every: 'hours',
            hours: 2,
            between: true,
            from: time,
            until: shift(time, 9),
            weekdaysOnly: true,
         }),
         node(
            'people',
            'input.profiles',
            1,
            0,
            profiles(
               { howMany: 50 },
               {
                  labels: [label],
                  connection: 'CONNECTED',
                  neverMessaged: true,
               }
            )
         ),
         node('chat', 'collect.chat', 2, 0),
         node('talked', 'logic.ifPerson', 3, 0, {
            check: 'chatStored',
            op: 'is',
            value: 'no',
            check2: '',
            check3: '',
         }),
         node('wait', 'logic.personWait', 4, 0, {
            after: 'accepted',
            atLeast: 1,
            plusUpTo: 23,
         }),
         accounts('accounts', 5, 0),
         node('room', 'process.room', 6, 0, { action: 'message' }),
         node('send', 'account.sendMessage', 7, 0, {
            text: answers.message,
            skipMissing: true,
         }),
      ],
      edges: wire([
         ['trigger', 'people'],
         ['people', 'chat'],
         ['chat', 'talked'],
         ['talked', 'wait'],
         ['wait', 'accounts'],
         ['accounts', 'room'],
         ['room', 'send'],
      ]),
   }

   // 5 and 6 Hand off: the silent, and the ones who never answered the invite, with their work email, as a CSV and optionally to an address.
   const handOff = (at: string, filters: object, pick: NodeConfig, tag: string): Graph => ({
      nodes: [
         schedule(at),
         node(
            'people',
            'input.profiles',
            1,
            0,
            profiles(
               {
                  howMany: 200,
                  ...pick,
               },
               filters
            )
         ),
         node('emails', 'collect.emailsFromLinks', 2, 0),
         node('profile', 'collect.profile', 3, 0),
         node('tag', 'process.tag', 4, 0, { tags: [tag] }),
         node('csv', 'output.csv', 5, 0),
         ...(answers.handOffUrl === '' ? [] : [node('send', 'output.sendApi', 6, 0, { url: answers.handOffUrl })]),
      ],
      edges: wire([
         ['trigger', 'people'],
         ['people', 'emails'],
         ['emails', 'profile'],
         ['profile', 'tag'],
         ['tag', 'csv'],
         ...(answers.handOffUrl === '' ? [] : [['csv', 'send'] as [string, string]]),
      ]),
   })

   return {
      campaign: {
         name: answers.name,
         label,
      },
      workflows: [
         {
            stage: 'DISCOVER',
            name: `${answers.name} \u00b7 1 Discover`,
            graph: discover,
         },
         {
            stage: 'INVITE',
            name: `${answers.name} \u00b7 2 Invite`,
            graph: inviteGraph,
         },
         {
            stage: 'WARM_UP',
            name: `${answers.name} \u00b7 3 Warm up`,
            graph: {
               nodes: warmNodes,
               edges: wire(warmEdges),
            },
         },
         {
            stage: 'FIRST_MESSAGE',
            name: `${answers.name} \u00b7 4 First message`,
            graph: message,
         },
         {
            stage: 'HAND_OFF',
            name: `${answers.name} \u00b7 5 Hand off`,
            graph: handOff(
               shift(time, 2),
               {
                  labels: [label],
                  waiting: true,
               },
               {
                  dateField: 'lastSent',
                  added: 'olderThan',
                  days: CAMPAIGN_LIMITS.silentDays,
                  withoutLabels: ['handed-off'],
               },
               'handed-off'
            ),
         },
         {
            stage: 'NO_ANSWER',
            name: `${answers.name} \u00b7 6 No answer`,
            graph: handOff(
               shift(time, 3),
               {
                  labels: [label],
                  invites: ['PENDING'],
               },
               {
                  dateField: 'invitedOn',
                  added: 'olderThan',
                  days: 21,
                  withoutLabels: ['no-answer'],
               },
               'no-answer'
            ),
         },
      ],
   }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The registry: one recipe now; a finder or an automation is another entry with its own questions.

export const RECIPES = {
   outreach: {
      title: 'Outreach campaign',
      summary:
         'Find people who post about your problem, invite them, warm them up, message the ones who accept and hand off the rest.',
      schema: outreachAnswersSchema,
   },
} as const

export type RecipeId = keyof typeof RECIPES
