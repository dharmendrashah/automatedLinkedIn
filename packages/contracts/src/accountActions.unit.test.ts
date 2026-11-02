import { describe, expect, it } from 'vitest'

import { type Graph, type NodeConfig, blockOf, errorsOf, validateGraph } from './workflow'

const node = (id: string, type: Graph['nodes'][number]['type'], config: NodeConfig = {}) => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const problems = (...nodes: Graph['nodes']) =>
   errorsOf(
      validateGraph({
         nodes,
         edges: nodes.slice(1).map((next, index) => ({
            from: nodes[index]?.id ?? '',
            to: next.id,
         })),
      })
   ).map(({ message }) => message)

describe('the account settings of the Account Actions blocks', () => {
   it('should read a block saved before as the nearest Select accounts, with the wait it had', () => {
      expect(blockOf('account.visitProfile').config.parse({})).toMatchObject({
         accountMode: 'pool',
         account: '',
         timeLimitHours: 8,
      })
      expect(blockOf('account.writePost').config.parse({})).toMatchObject({
         accountMode: 'pool',
         timeLimitHours: 1,
      })
   })

   it('should need Select accounts only when the block takes its accounts from it', () => {
      expect(problems(node('visit', 'account.visitProfile'))).toEqual([
         'Visit profile needs "Select accounts" before it, or one account picked on the block.',
      ])
      expect(
         problems(
            node('visit', 'account.visitProfile', {
               accountMode: 'one',
               account: 'a1',
            })
         )
      ).toEqual([])
      expect(problems(node('visit', 'account.visitProfile', { accountMode: 'one' }))).toEqual([
         'Visit profile: pick the account it uses.',
      ])
   })

   it('should refuse a time limit outside 1 to 48 hours', () => {
      const schema = blockOf('account.visitCompany').config

      expect(schema.safeParse({ timeLimitHours: 0 }).success).toBe(false)
      expect(schema.safeParse({ timeLimitHours: 49 }).success).toBe(false)
      expect(schema.safeParse({ timeLimitHours: 48 }).success).toBe(true)
   })
})
