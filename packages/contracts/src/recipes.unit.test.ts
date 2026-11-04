import { describe, expect, it } from 'vitest'

import { type OutreachAnswers, buildOutreach, capacityOf, outreachAnswersSchema } from './recipes'
import { validateGraph } from './workflow'
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

const build = (extra: Partial<OutreachAnswers> = {}) =>
   buildOutreach(
      {
         ...answers,
         ...extra,
      },
      'icp-1'
   )

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
   it('should say what the accounts can send and how many posts fill it', () => {
      expect(capacityOf(5, 8)).toMatchObject({
         invitesLow: 46,
         invitesHigh: 57,
         found: 120,
         suggestedPosts: 9,
      })
      expect(capacityOf(5, 8).sentence).toBe(
         '5 accounts can send about 46 to 57 invites a day. At 8 posts a day you will find about 120 people a day, more than you can invite, so only the best are invited.'
      )
   })

   it('should say so when no account can send, and when the posts do not fill the room', () => {
      expect(capacityOf(0, 8).sentence).toContain('No account is signed in')
      expect(capacityOf(10, 1).sentence).toContain('fewer than you can invite')
   })
})
