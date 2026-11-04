import { describe, expect, it } from 'vitest'

import {
   AUTOMATIONS,
   type AutomationAnswers,
   type AutomationId,
   automationAnswersSchema,
   automationProblems,
   buildAutomation,
   experimentParts,
   isAutomationId,
} from './automations'
import { validateGraph } from './workflow'
import { blockOf } from './workflow'

const answers: AutomationAnswers = {
   name: 'Intent for agencies',
   icpId: 'icp-1',
   phrases: ['looking for an outbound tool', 'cold email not working'],
   note: 'Hi {first_name}, saw your post.',
   message: 'Hi {first_name}, who else should hear about us?',
}

const READY: AutomationId[] = ['A1', 'A10', 'A11', 'A13', 'A14']

describe('the catalog', () => {
   it('should list all sixteen automations once, in three waves', () => {
      expect(AUTOMATIONS).toHaveLength(16)
      expect(new Set(AUTOMATIONS.map(({ id }) => id)).size).toBe(16)
      expect(AUTOMATIONS.map(({ wave }) => wave)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3])
   })

   it('should say what each unbuilt automation waits for, and nothing for the built ones', () => {
      const built = AUTOMATIONS.filter(({ waitsFor }) => waitsFor === null).map(({ id }) => id)

      expect(built.sort()).toEqual([...READY, 'A16'].sort())
      expect(
         AUTOMATIONS.filter(({ waitsFor }) => waitsFor !== null).every(({ waitsFor }) => (waitsFor ?? '').length > 10)
      ).toBe(true)
   })

   it('should know an id', () => {
      expect(isAutomationId('A1')).toBe(true)
      expect(isAutomationId('A17')).toBe(false)
   })
})

describe('buildAutomation', () => {
   it.each(READY)('should give %s graphs with no error and settings every block accepts', id => {
      const workflows = buildAutomation(id, answers)

      expect(workflows.length).toBeGreaterThan(0)

      for (const { name, graph } of workflows) {
         const errors = validateGraph(graph).filter(({ level }) => level === 'error')

         expect(errors, `${id} ${name}`).toEqual([])

         for (const each of graph.nodes) {
            const parsed = blockOf(each.type).config.safeParse(each.config)

            expect(parsed.success, `${id} ${each.id} ${JSON.stringify(parsed.error?.issues ?? [])}`).toBe(true)
         }
      }
   })

   it.each(READY)('should never switch an act on in %s', id => {
      for (const { graph } of buildAutomation(id, answers)) {
         for (const each of graph.nodes) {
            expect(each.config.actForReal ?? false, each.id).toBe(false)
         }
      }
   })

   it('should name every workflow after the automation and put it in no stage', () => {
      const [first] = buildAutomation('A1', answers)

      expect(first).toMatchObject({
         name: 'Intent for agencies \u00b7 Intent radar',
         stage: 'OTHER',
      })
   })

   it('should end every finder with the tail: tier D is not read, and customers are left out', () => {
      const graph = buildAutomation('A1', answers)[0]?.graph
      const find = (id: string) => graph?.nodes.find(node => node.id === id)

      expect(find('tailScore')?.config).toMatchObject({
         icpId: 'icp-1',
         keepTierD: false,
      })
      expect(find('tailDedupe')?.config).toMatchObject({ skipCompanyLabel: 'customer' })
      expect(JSON.stringify(find('tailLabel')?.config)).toContain('lead-intent-for-agencies')
   })

   it('should send the urgent posts to their authors and everything else, the unlabelled too, to the engagers', () => {
      const { edges } = buildAutomation('A1', answers)[0]?.graph ?? { edges: [] }

      expect(edges).toContainEqual({
         from: 'urgent',
         to: 'authors',
      })
      for (const from of ['urgent', 'classify']) {
         for (const to of ['commenters', 'reactors']) {
            expect(edges).toContainEqual({
               from,
               to,
               fromPort: 'else',
            })
         }
      }
   })

   it('should build one search for each phrase', () => {
      const graph = buildAutomation('A10', {
         ...answers,
         phrases: ['one phrase'],
      })[0]?.graph

      expect(graph?.nodes.filter(({ type }) => type === 'collect.findPosts')).toHaveLength(1)
   })

   it('should build nothing for an automation that waits for a block', () => {
      expect(buildAutomation('A2', answers)).toEqual([])
   })

   it('should refuse an automation that lacks what it needs, with one sentence', () => {
      expect(
         automationProblems('A1', {
            ...answers,
            phrases: [],
         })
      ).toEqual(['Add at least one phrase.'])
      expect(
         automationProblems('A14', {
            ...answers,
            message: '',
         })
      ).toEqual(['Write the message to your customers.'])
      expect(() =>
         buildAutomation('A1', {
            ...answers,
            phrases: [],
         })
      ).toThrow('Add at least one phrase.')
      expect(
         automationProblems('A13', {
            ...answers,
            phrases: [],
            message: '',
         })
      ).toEqual([])
   })
})

describe('the answers', () => {
   const refused = (extra: Record<string, unknown>) =>
      automationAnswersSchema
         .safeParse({
            ...answers,
            ...extra,
         })
         .error?.issues.map(({ message }) => message)

   it('should say in one sentence what is missing or wrong', () => {
      expect(refused({ name: ' ' })).toEqual(['Name the automation.'])
      expect(refused({ icpId: '' })).toEqual(['Pick a saved ideal customer.'])
      expect(refused({ phrases: ['no'] })).toEqual(['A phrase has at least 3 characters.'])
      expect(refused({ note: 'x'.repeat(201) })).toContain('A note has up to 200 characters.')
      expect(refused({ message: 'Hi {not_a_variable}' })).toEqual([expect.stringContaining('not_a_variable')])
      expect(
         refused({
            accounts: {
               mode: 'pick',
               ids: [],
            },
         })
      ).toEqual(['Pick at least one account.'])
   })
})

describe('experimentParts (A16)', () => {
   it('should split a stable share and label both sides, so two versions can be compared', () => {
      const parts = experimentParts('last', 40)

      expect(parts.nodes.find(({ id }) => id === 'expSplit')?.config).toEqual({ percent: 40 })
      expect(parts.edges).toEqual([
         ['last', 'expSplit'],
         ['expSplit', 'expA'],
         ['expSplit', 'expB', 'else'],
      ])
   })
})
