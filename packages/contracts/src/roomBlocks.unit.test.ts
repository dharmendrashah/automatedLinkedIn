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

const errors = (graph: Graph) => validateGraph(graph).filter(({ level }) => level === 'error')

describe('Fit to today\u2019s limit', () => {
   it('should start on connection requests, best score first, with the accounts of Select accounts', () => {
      expect(blockOf('process.room').config.parse({})).toEqual({
         action: 'invite',
         orderBy: 'score',
         accountMode: 'pool',
         account: '',
      })
   })

   it('should need Select accounts before it, or one account', () => {
      expect(errors(chain(node('room', 'process.room'))).map(({ message }) => message)).toEqual([
         expect.stringContaining('needs "Select accounts"'),
      ])
      expect(errors(chain(node('select', 'account.select', { scope: 'all' }), node('room', 'process.room')))).toEqual(
         []
      )
      expect(errors(chain(node('room', 'process.room', { accountMode: 'one' }))).map(({ message }) => message)).toEqual(
         [expect.stringContaining('pick the account')]
      )
      expect(
         errors(
            chain(
               node('room', 'process.room', {
                  accountMode: 'one',
                  account: 'a1',
               })
            )
         )
      ).toEqual([])
   })

   it('should keep what it left out for an Else after it', () => {
      expect(blockOf('process.room').flags).toMatchObject({
         keepsAside: true,
         takesAnything: true,
      })
      expect(blockOf('logic.personWait').flags).toMatchObject({ keepsAside: true })
   })
})

describe('Wait per person', () => {
   it('should start one hour after they accepted, with no random extra and the people with no date let through', () => {
      expect(blockOf('logic.personWait').config.parse({})).toEqual({
         after: 'accepted',
         atLeast: 1,
         atLeastUnit: 'hours',
         plusUpTo: 0,
         plusUpToUnit: 'hours',
         ifNoDate: 'through',
      })
   })

   it('should refuse a wait beyond a year and a moment that is not offered', () => {
      expect(blockOf('logic.personWait').config.safeParse({ atLeast: 366 }).success).toBe(false)
      expect(blockOf('logic.personWait').config.safeParse({ after: 'later' }).success).toBe(false)
   })
})
