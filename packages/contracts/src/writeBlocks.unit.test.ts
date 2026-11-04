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

const chain = (...nodes: Graph['nodes']): Graph => ({
   nodes: [node('start', 'trigger.manual'), ...nodes],
   edges: ['start', ...nodes.map(({ id }) => id)].slice(1).map((to, index) => ({
      from: ['start', ...nodes.map(({ id }) => id)][index] ?? '',
      to,
   })),
})

const messages = (graph: Graph, level: 'error' | 'note') =>
   validateGraph(graph)
      .filter(each => each.level === level)
      .map(({ message }) => message)

describe('Write words', () => {
   it('should start from the texts, with one starter text, and write short with AI', () => {
      expect(blockOf('process.write').config.parse({})).toMatchObject({
         how: 'texts',
         length: 'short',
         skipSensitive: true,
         minChars: 80,
         atMost: 30,
      })
      expect(blockOf('process.write').config.parse({}).texts).toHaveLength(1)
   })

   it('should need a voice with AI, and good texts from the texts', () => {
      expect(messages(chain(node('write', 'process.write', { how: 'ai' })), 'error')).toEqual([
         'Write words: pick a voice.',
      ])
      expect(
         messages(
            chain(
               node('write', 'process.write', {
                  how: 'ai',
                  voice: 'v1',
               })
            ),
            'error'
         )
      ).toEqual([])
      expect(messages(chain(node('write', 'process.write', { texts: ['Hello {nobody}'] })), 'error')).toEqual([
         expect.stringContaining('{nobody} is not a variable'),
      ])
   })

   it('should keep what it did not write for an Else after it', () => {
      expect(blockOf('process.write').flags).toMatchObject({ keepsAside: true })
   })
})

describe('Ask me first and When I approve', () => {
   it('should note that approving does nothing without When I approve, and say nothing with it', () => {
      expect(messages(chain(node('ask', 'logic.approve')), 'note')).toEqual(
         expect.arrayContaining([expect.stringContaining('approving does nothing')])
      )
      expect(
         messages(chain(node('ask', 'logic.approve'), node('approved', 'trigger.approved')), 'note').join(' ')
      ).not.toContain('approving does nothing')
   })

   it('should start with 10 a day, 48 hours and 20 waiting, and group approvals for 5 minutes', () => {
      expect(blockOf('logic.approve').config.parse({})).toEqual({
         perDay: 10,
         expire: '48',
         keepWaiting: 20,
      })
      expect(blockOf('trigger.approved').config.parse({})).toEqual({
         what: 'any',
         from: 'this',
         groupMinutes: 5,
         maxPerHour: 30,
      })
   })

   it('should refuse an expiry that is not offered', () => {
      expect(blockOf('logic.approve').config.safeParse({ expire: '5' }).success).toBe(false)
   })
})

describe('Comment on post', () => {
   it('should use the words from before, their inviter, and act for real off', () => {
      expect(blockOf('account.commentOnPost').config.parse({})).toMatchObject({
         words: '{written}',
         accountMode: 'inviter',
         actForReal: false,
         daysApart: 1,
      })
   })

   it('should need words, and need no Select accounts for their inviter', () => {
      expect(messages(chain(node('comment', 'account.commentOnPost', { words: '' })), 'error')).toEqual([
         'Comment on post: write the words.',
      ])
      expect(messages(chain(node('comment', 'account.commentOnPost')), 'error')).toEqual([])
   })

   it('should note that {written} has nothing to give without Write words or When I approve before it', () => {
      expect(messages(chain(node('comment', 'account.commentOnPost')), 'note')).toEqual(
         expect.arrayContaining([expect.stringContaining('uses {written}')])
      )
      expect(
         messages(chain(node('write', 'process.write'), node('comment', 'account.commentOnPost')), 'note').join(' ')
      ).not.toContain('uses {written}')
   })
})
