import { describe, expect, it } from 'vitest'

import { type Block, type Graph } from './types'

import {
   canConnect,
   choicesFor,
   combineRounds,
   hasLoop,
   newNodeId,
   startConfig,
   summaryOf,
   toFlow,
   toGraph,
} from './graph-convert'

const block = (type: Block['type'], input: Block['input'], output: Block['output']): Block => ({
   type,
   group: 'Process',
   label: type,
   summary: '',
   costHint: null,
   presets: [],
   input,
   output,
   fields: [],
   defaults: {},
})

const catalog = [
   block('input.posts', 'start', 'post'),
   block('collect.commenters', 'post', 'profile'),
   block('score.icp', 'profile', 'profile'),
]

const graph: Graph = {
   nodes: [
      {
         id: 'posts',
         type: 'input.posts',
         config: { howMany: 3 },
         position: {
            x: 0,
            y: 0,
         },
      },
      {
         id: 'commenters',
         type: 'collect.commenters',
         config: {},
         position: {
            x: 240.4,
            y: 0,
         },
      },
      {
         id: 'score',
         type: 'score.icp',
         config: {},
         position: {
            x: 480,
            y: 0,
         },
      },
   ],
   edges: [
      {
         from: 'posts',
         to: 'commenters',
      },
   ],
}

describe('input blocks', () => {
   const profiles = block('input.profiles', 'start', 'profile')

   it('should say on the card which slice an input block takes', () => {
      expect(summaryOf(profiles, { howMany: 50 })).toBe('Up to 50 people')
      expect(
         summaryOf(profiles, {
            howMany: 50,
            labels: ['acme', 'fintech'],
            labelMatch: 'all',
            added: 'week',
            statuses: ['NEW'],
         })
      ).toBe('Up to 50 people · labelled acme and fintech · added this week · new only')
   })

   it('should start new input blocks on All, profiles and companies on new ones only, in the owner time zone', () => {
      expect(startConfig('input.profiles', 'Asia/Kolkata')).toEqual({
         timeZone: 'Asia/Kolkata',
         all: true,
         statuses: ['NEW'],
      })
      expect(startConfig('input.posts', 'Asia/Kolkata')).toEqual({
         timeZone: 'Asia/Kolkata',
         all: true,
      })
      expect(startConfig('collect.commenters', 'Asia/Kolkata')).toEqual({})
   })
})

describe('graph-convert', () => {
   it('should round-trip a graph and label edges with what the run passed along', () => {
      const { nodes, edges } = toFlow(graph, catalog, {
         steps: [
            {
               id: 'step-posts',
               nodeId: 'posts',
               type: 'input.posts',
               status: 'DONE',
               round: 0,
               itemsIn: 0,
               itemsOut: 3,
               costMicros: 0,
               message: null,
               childRunId: null,
               tries: 0,
               child: null,
               progress: null,
            },
         ],
      })

      expect(edges[0].label).toBe('3 posts')
      expect(toGraph(nodes, edges).nodes[1].position.x).toBe(240)
      expect(toGraph(nodes, edges).edges).toEqual([
         {
            ...graph.edges[0],
            fromSide: 'bottom',
            toSide: 'top',
         },
      ])
   })

   it('should join any two blocks once, and never a block to itself', () => {
      const { edges } = toFlow(graph, catalog)

      expect(canConnect(edges, 'posts', 'score')).toBe(true)
      expect(canConnect(edges, 'posts', 'commenters')).toBe(false)
      expect(canConnect(edges, 'score', 'score')).toBe(false)
      expect(hasLoop(edges)).toBe(false)
      expect(
         hasLoop([
            ...edges,
            {
               source: 'commenters',
               target: 'posts',
            },
         ])
      ).toBe(true)
   })

   it('should add up the rounds of a block and keep the most telling state', () => {
      const step = {
         nodeId: 'each',
         type: 'logic.forEach',
         itemsIn: 2,
         itemsOut: 2,
         costMicros: 10,
         message: null,
         childRunId: null,
         tries: 0,
         child: null,
         id: 'step-each',
         progress: null,
      }
      const combined = combineRounds([
         {
            ...step,
            status: 'DONE',
            round: 0,
         },
         {
            ...step,
            status: 'RUNNING',
            round: 1,
         },
      ]).get('each')

      expect(combined).toMatchObject({
         status: 'RUNNING',
         itemsOut: 4,
         costMicros: 20,
         round: 1,
      })
   })

   it('should name a new block after its type without clashing', () => {
      expect(newNodeId('collect.commenters', [{ id: 'commenters-1' }])).toBe('commenters-2')
   })

   it('should offer every block but a trigger after a block, filtered by the search', () => {
      const types = (blocks: Block[]) => blocks.map(({ type }) => type)
      const withTrigger = [block('trigger.manual', null, 'start'), ...catalog]

      expect(types(choicesFor(withTrigger, catalog[0], ''))).toEqual(types(catalog))
      expect(types(choicesFor(withTrigger, null, 'SCORE'))).toEqual(['score.icp'])
   })
})

describe('Account Actions blocks', () => {
   const select = block('account.select', 'profile', 'profile')

   it('should say how many accounts take turns, and ask for accounts when none is picked', () => {
      expect(summaryOf(select, { accounts: ['a1', 'a2', 'a3'] })).toBe('Takes turns across 3 accounts')
      expect(summaryOf(select, { accounts: ['a1'] })).toBe('Uses 1 account')
      expect(summaryOf(select, {})).toBe('Pick the accounts to use')
   })

   it('should show the first words of a written post, or ask for one', () => {
      const write = block('account.writePost', 'profile', 'profile')
      const post = (blocks: unknown[]) => ({ post: JSON.stringify(blocks) })

      expect(summaryOf(write, {})).toBe('Write the post')
      expect(summaryOf(write, post([]))).toBe('Write the post')
      expect(
         summaryOf(
            write,
            post([
               {
                  id: 't1',
                  type: 'TEXT',
                  text: 'Hello   there',
               },
            ])
         )
      ).toBe('Posts “Hello there”')
      expect(
         summaryOf(
            write,
            post([
               {
                  id: 'v1',
                  type: 'VIDEO',
                  file: {
                     id: 'f1',
                     name: 'a.mp4',
                     bytes: 10,
                  },
               },
            ])
         )
      ).toBe('Posts only Video')
   })
})

describe('Logic blocks', () => {
   const wait = block('logic.wait', 'profile', 'profile')
   const retry = block('logic.retry', 'profile', 'profile')

   it('should say how long a Wait waits, and what a Retry does', () => {
      expect(summaryOf(wait, { mode: 'exact', seconds: 30 })).toBe('Waits 30 seconds')
      expect(summaryOf(wait, { mode: 'exact', seconds: 1 })).toBe('Waits 1 second')
      expect(summaryOf(wait, { mode: 'between', minSeconds: 20, maxSeconds: 60 })).toBe('Waits 20 to 60 seconds')
      expect(summaryOf(retry, { times: 3, waitSeconds: 0 })).toBe('Tries up to 3 more times')
      expect(summaryOf(retry, { times: 1, waitSeconds: 30 })).toBe('Tries once more, after 30 seconds')
   })
})
