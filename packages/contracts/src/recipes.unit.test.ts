import { describe, expect, it } from 'vitest'

import { type OutreachAnswers, buildOutreach, capacityOf, outreachAnswersSchema } from './recipes'
import { type Graph, scheduleOf, validateGraph } from './workflow'
import { blockOf } from './workflow'

const answers: OutreachAnswers = {
   name: 'Outbound for agencies',
   phrases: ['onboarding too slow', 'client churn'],
   customer: { includeTitles: ['founder', 'head of growth'] },
   message: 'Hi {first_name}, thanks for connecting.',
   note: 'Hi {first_name}, I liked your post.',
   warmUp: {
      reactions: true,
      comments: 'texts',
      texts: ['Great point, {author_first_name}.'],
   },
}

const build = (extra: Partial<OutreachAnswers> = {}, discoverId?: string) =>
   buildOutreach(
      {
         ...answers,
         ...extra,
      },
      'icp-1',
      discoverId
   )

const linked = (graph: Graph | undefined, from: string, to: string) =>
   graph?.edges.some(edge => edge.from === from && edge.to === to) ?? false

describe('the Discover stage', () => {
   it('should read the profile before its one Score, with a read limit of 200', () => {
      const graph = build().workflows[0]?.graph

      expect(graph?.nodes.filter(({ type }) => type === 'score.icp').map(({ id }) => id)).toEqual(['score'])
      expect(graph?.nodes.find(({ id }) => id === 'profile')?.config).toEqual({
         readLimit: 200,
         reread: false,
      })
      expect(linked(graph, 'people', 'profile')).toBe(true)
      expect(linked(graph, 'profile', 'score')).toBe(true)
      expect(linked(graph, 'score', 'label')).toBe(true)
      expect(linked(graph, 'label', 'list')).toBe(true)
      expect(graph?.nodes.some(({ id }) => id === 'score2')).toBe(false)
   })
})

describe('the Invite trigger', () => {
   it('should start on Discover and on a daily clock four hours later, in both branches', () => {
      for (const extra of [{}, { note: '' }]) {
         const invite = build(extra, 'discover-1').workflows[1]?.graph
         const triggers = invite?.nodes.filter(({ type }) => type.startsWith('trigger.')) ?? []

         expect(triggers).toEqual([
            expect.objectContaining({
               id: 'trigger',
               type: 'trigger.workflow',
               config: { workflowId: 'discover-1' },
            }),
            expect.objectContaining({
               id: 'clock',
               type: 'trigger.schedule',
               config: {
                  every: 'day',
                  at: '13:00',
                  timeZone: 'UTC',
               },
            }),
         ])
         expect(linked(invite, 'trigger', 'people')).toBe(true)
         expect(linked(invite, 'clock', 'people')).toBe(true)
         expect(invite && validateGraph(invite).filter(({ level }) => level === 'error')).toEqual([])
         expect(invite && scheduleOf(invite)).not.toBeNull()
         expect(invite?.nodes.find(({ id }) => id === 'people')?.config).toMatchObject({
            howMany: 100,
            added: 'any',
            order: 'newest',
         })
      }
   })

   it('should keep the schedule when no Discover is given', () => {
      const invite = build().workflows[1]?.graph

      expect(invite?.nodes.find(({ id }) => id === 'trigger')?.type).toBe('trigger.schedule')
   })
})

describe('the outreach recipe', () => {
   it('should build six workflows in order, with the campaign label and the stage of each', () => {
      const { campaign, workflows } = build()

      expect(campaign).toEqual({
         name: 'Outbound for agencies',
         label: 'lead-outbound-for-agencies',
      })
      expect(workflows.map(({ stage }) => stage)).toEqual([
         'DISCOVER',
         'INVITE',
         'WARM_UP',
         'FIRST_MESSAGE',
         'HAND_OFF',
         'NO_ANSWER',
      ])
      expect(workflows[0]?.name).toBe('Outbound for agencies \u00b7 1 Discover')
   })

   it.each([
      ['every option on', {}],
      [
         'no note, no comments, no reactions',
         {
            note: '',
            warmUp: {
               reactions: false,
               comments: 'off' as const,
               texts: [],
            },
         },
      ],
      ['hand-off to an address', { handOffUrl: 'https://example.com/hook' }],
      [
         'picked accounts',
         {
            accounts: {
               mode: 'pick' as const,
               ids: ['a1', 'a2'],
            },
         },
      ],
      ['one phrase', { phrases: ['onboarding too slow'] }],
   ])('should give graphs with no error and settings every block accepts (%s)', (_name, extra) => {
      for (const { stage, graph } of build(extra).workflows) {
         const errors = validateGraph(graph).filter(({ level }) => level === 'error')

         expect(errors, stage).toEqual([])

         for (const each of graph.nodes) {
            const parsed = blockOf(each.type).config.safeParse(each.config)

            expect(parsed.success, `${stage} ${each.id} ${JSON.stringify(parsed.error?.issues ?? [])}`).toBe(true)
         }
      }
   })

   it('should never switch an act on: every act block keeps Act for real off', () => {
      for (const { graph } of build().workflows) {
         for (const each of graph.nodes) {
            expect(each.config.actForReal ?? false, each.id).toBe(false)
         }
      }
   })

   it('should carry the campaign label into Discover and into every input of the later stages', () => {
      const { workflows } = build()
      const label = 'lead-outbound-for-agencies'

      expect(JSON.stringify(workflows[0]?.graph.nodes.find(({ id }) => id === 'label')?.config)).toContain(label)

      for (const { graph } of workflows.slice(1)) {
         expect(String(graph.nodes.find(({ id }) => id === 'people')?.config.filters)).toContain(label)
      }
   })

   it('should stagger the six schedules from the start time and keep first messages inside the working hours', () => {
      const { workflows } = build({
         when: {
            time: '09:00',
            timeZone: 'Asia/Kolkata',
         },
      })
      const at = workflows.map(({ graph }) => graph.nodes.find(({ type }) => type === 'trigger.schedule')?.config)

      expect(at.map(config => config?.at)).toEqual(['09:00', '10:00', '14:00', '09:00', '11:00', '12:00'])
      expect(at[3]).toMatchObject({
         every: 'hours',
         hours: 2,
         between: true,
         from: '09:00',
         until: '18:00',
      })
      expect(at.every(config => config?.timeZone === 'Asia/Kolkata')).toBe(true)
   })

   it('should keep the control group of the warm-up in the Else of the split', () => {
      const warm = build().workflows[2]?.graph

      expect(warm?.edges).toContainEqual({
         from: 'split',
         to: 'control',
         fromPort: 'else',
      })
      expect(warm?.nodes.find(({ id }) => id === 'split')?.config).toEqual({ percent: 90 })
   })
})

describe('the answers', () => {
   const refused = (extra: Record<string, unknown>) =>
      outreachAnswersSchema
         .safeParse({
            ...answers,
            ...extra,
         })
         .error?.issues.map(({ message }) => message)

   it('should say in one sentence what is missing', () => {
      expect(refused({ name: ' ' })).toEqual(['Name the campaign.'])
      expect(refused({ phrases: [] })).toEqual(['Add at least one phrase.'])
      expect(refused({ phrases: ['no'] })).toEqual(['A phrase has at least 3 characters.'])
      expect(refused({ customer: {} })).toEqual(['Add at least one job title, or pick a saved ideal customer.'])
      expect(refused({ message: '' })).toEqual(['Write the first message.'])
      expect(refused({ note: 'x'.repeat(201) })).toContain('A note has up to 200 characters.')
      expect(refused({ handOffUrl: 'http://example.com' })).toEqual(['The address must start with https://.'])
      expect(
         refused({
            accounts: {
               mode: 'pick',
               ids: [],
            },
         })
      ).toEqual(['Pick at least one account.'])
      expect(
         refused({
            warmUp: {
               comments: 'texts',
               texts: [],
            },
         })
      ).toEqual(['Write at least one comment text, or turn comments off.'])
   })

   it('should check the words with the same checks the blocks use', () => {
      expect(refused({ message: 'Hi {not_a_variable}' })).toEqual([expect.stringContaining('not_a_variable')])
      expect(refused({ note: 'Hi {first_name' })?.length).toBeGreaterThan(0)
      expect(
         refused({
            warmUp: {
               comments: 'texts',
               texts: ['Hello {nobody}'],
            },
         })
      ).toEqual([expect.stringContaining('nobody')])
   })

   it('should accept a saved ideal customer instead of titles', () => {
      expect(refused({ customer: { icpId: 'icp-1' } })).toBeUndefined()
   })
})

describe('capacityOf', () => {
   it('should say what the accounts can send, how many posts fill it, and what that costs a day', () => {
      expect(capacityOf(5, 8)).toMatchObject({
         invitesLow: 46,
         invitesHigh: 57,
         found: 80,
         fit: 16,
         costPerDayUsd: 0.48,
         suggestedPosts: 29,
      })
      expect(capacityOf(5, 8).sentence).toBe(
         "5 accounts can send about 46 to 57 invites a day. At 8 posts a day you will find about 80 people a day, about 16 of them a fit, fewer than you can invite. That costs about $0.48 a day (an estimate from one campaign's first week)."
      )
      expect(capacityOf(3, 1).suggestedPosts).toBe(17)
   })

   it('should say so when no account can send, when the posts fill the room, and never suggest more than 50 posts', () => {
      expect(capacityOf(0, 8).sentence).toContain('No account is signed in')
      expect(capacityOf(10, 1).sentence).toContain('fewer than you can invite')
      expect(capacityOf(3, 30).sentence).toContain('more than you can invite, so only the best are invited')
      expect(capacityOf(30, 1).suggestedPosts).toBe(50)
   })
})
