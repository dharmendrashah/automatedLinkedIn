import { describe, expect, it } from 'vitest'

import { type Graph, blockOf, validateGraph } from './workflow'

const node = (id: string, type: Graph['nodes'][number]['type'], config: Graph['nodes'][number]['config'] = {}) => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const chain = (...nodes: Graph['nodes']): Graph => {
   const ids = ['start', ...nodes.map(({ id }) => id)]

   return {
      nodes: [node('start', 'trigger.manual'), ...nodes],
      edges: ids.slice(1).map((to, index) => ({
         from: ids[index] ?? '',
         to,
      })),
   }
}

const errors = (graph: Graph) => validateGraph(graph).filter(({ level }) => level === 'error')

const messages = (graph: Graph) => errors(graph).map(({ message }) => message)

describe('If person state', () => {
   it('should start on "connected is yes" for any signed-in account, and call facts older than 36 hours not known', () => {
      expect(blockOf('logic.ifPerson').config.parse({})).toMatchObject({
         match: 'all',
         check: 'connected',
         op: 'is',
         value: 'yes',
         check2: '',
         accountMode: 'any',
         maxAgeHours: 36,
      })
      expect(
         errors(
            chain(
               node('who', 'input.profiles', { links: ['https://www.linkedin.com/in/ada'] }),
               node('if', 'logic.ifPerson')
            )
         )
      ).toEqual([])
   })

   it('should ask for a check, a value that fits the fact, and an operator the fact takes', () => {
      expect(messages(chain(node('if', 'logic.ifPerson', { check: '' })))).toContain('If person state: pick a check.')
      expect(
         messages(
            chain(
               node('if', 'logic.ifPerson', {
                  check: 'connected',
                  op: 'is',
                  value: 'maybe',
               })
            )
         )
      ).toContain('If person state, check 1: write yes or no.')
      expect(
         messages(
            chain(
               node('if', 'logic.ifPerson', {
                  check: 'score',
                  op: 'atLeast',
                  value: 'high',
               })
            )
         )
      ).toContain('If person state, check 1: write a number.')
      expect(
         messages(
            chain(
               node('if', 'logic.ifPerson', {
                  check: 'status',
                  op: 'is',
                  value: 'angry',
               })
            )
         )[0]
      ).toContain('write one of new, contacted')
      expect(
         messages(
            chain(
               node('if', 'logic.ifPerson', {
                  check: 'label',
                  op: 'atLeast',
                  value: '1',
               })
            )
         )[0]
      ).toContain('does not take')
      expect(
         messages(
            chain(
               node('if', 'logic.ifPerson', {
                  check: 'nope',
                  op: 'is',
                  value: 'x',
               })
            )
         )[0]
      ).toContain('pick a fact from the list')
   })

   it('should not ask a value for "is known" and "is not known"', () => {
      expect(
         errors(
            chain(
               node('if', 'logic.ifPerson', {
                  check: 'score',
                  op: 'known',
                  value: '',
               })
            )
         )
      ).toEqual([])
   })

   it('should need Select accounts before it, or one account', () => {
      expect(messages(chain(node('if', 'logic.ifPerson', { accountMode: 'pool' })))).toEqual([
         expect.stringContaining('needs "Select accounts"'),
      ])
      expect(
         errors(
            chain(
               node('pool', 'account.select', { scope: 'all' }),
               node('if', 'logic.ifPerson', { accountMode: 'pool' })
            )
         )
      ).toEqual([])
      expect(messages(chain(node('if', 'logic.ifPerson', { accountMode: 'one' })))).toEqual([
         expect.stringContaining('pick the account'),
      ])
   })

   it('should offer the six presets, each a valid block', () => {
      const presets = blockOf('logic.ifPerson').presets ?? []

      expect(presets.map(({ label }) => label)).toEqual([
         'Is a connection',
         'Not connected',
         'We already talked',
         'Never messaged',
         'They replied',
         'Invite pending 21 days or more',
      ])

      for (const { config } of presets) {
         expect(errors(chain(node('if', 'logic.ifPerson', config)))).toEqual([])
      }
   })

   it('should keep what it left out for an Else after it', () => {
      expect(blockOf('logic.ifPerson').flags).toMatchObject({ keepsAside: true })
   })
})

describe('Split people', () => {
   it('should start with 2 parts, take 1 to 10, anything with a slug, and keep a connector per extra part', () => {
      expect(blockOf('logic.split').config.parse({})).toEqual({
         parts: 2,
         percent: 50,
      })
      expect(blockOf('logic.split').config.safeParse({ parts: 1 }).success).toBe(true)
      expect(blockOf('logic.split').config.safeParse({ parts: 0 }).success).toBe(false)
      expect(blockOf('logic.split').config.safeParse({ parts: 11 }).success).toBe(false)
      expect(blockOf('logic.split').flags).toMatchObject({
         takesAnything: true,
         keepsAside: true,
      })
   })

   it('should still parse a block saved before "parts" existed, keeping its saved percent', () => {
      expect(blockOf('logic.split').config.parse({ percent: 90 })).toEqual({
         parts: 2,
         percent: 90,
      })
      expect(blockOf('logic.split').config.safeParse({ percent: 0 }).success).toBe(false)
      expect(blockOf('logic.split').config.safeParse({ percent: 100 }).success).toBe(false)
   })
})

describe('Get our chat with them', () => {
   it('should start with the latest 10 messages, any age, and emails and phones removed', () => {
      expect(blockOf('collect.chat').config.parse({})).toMatchObject({
         accountMode: 'any',
         latest: 10,
         maxAgeDays: 'any',
         redact: true,
      })
      expect(blockOf('collect.chat').config.safeParse({ latest: 31 }).success).toBe(false)
   })

   it('should be free and need accounts the same way', () => {
      expect(blockOf('collect.chat').costHint).toBe('free')
      expect(messages(chain(node('chat', 'collect.chat', { accountMode: 'pool' })))).toEqual([
         expect.stringContaining('needs "Select accounts"'),
      ])
   })
})
