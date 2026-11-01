import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { fakeDataClient } from 'core/fakeDataClient'

import { PrismaService, UserService, WalletService, WorkflowService } from 'database'

import { type Graph, type GraphNode } from '@automatedLinkedIn/contracts'

import { advanceRun } from './engine'

// Needs PostgreSQL. The data service is a fake: no money is spent. A call's values stand in for the settings they replace
// (.plan/api-fed-blocks-and-samples.md).

const email = `${randomUUID()}@elitale.com`

const node = (id: string, type: GraphNode['type'], config: GraphNode['config'] = {}): GraphNode => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const deps = (client: ReturnType<typeof fakeDataClient>) => ({
   client,
   signal: new AbortController().signal,
   log: {
      info: () => undefined,
      error: () => undefined,
   },
})

let userId: string

const run = async (graph: Graph, input?: Record<string, string | string[]>) => {
   const client = fakeDataClient(() => ({
      rows: [],
      costMicros: 0,
   }))
   const workflow = await WorkflowService.create(userId, {
      name: `Call ${randomUUID().slice(0, 8)}`,
      goal: null,
      graph,
   })
   const started = await WorkflowService.startRun(userId, workflow.id, 'API', `call-${randomUUID()}`, { input })

   await advanceRun(started?.id ?? '', deps(client))

   return client.start.mock.calls.map(([slug, params]) => ({
      slug,
      params: JSON.stringify(params).toLowerCase(),
   }))
}

const after = (block: GraphNode): Graph => ({
   nodes: [node('api', 'trigger.api'), block],
   edges: [
      {
         from: 'api',
         to: block.id,
      },
   ],
})

describe('a call feeds the blocks that start a chain (database)', () => {
   beforeAll(async () => {
      userId = (await UserService.create({ email })).id
      await WalletService.save(50_000_000)
   })

   afterAll(async () => {
      await PrismaService.client.user.deleteMany({ where: { email } })
      await PrismaService.disconnect()
   })

   it('should look up the websites a call sent instead of the saved ones, and the saved ones when it sent none', async () => {
      const block = node('find', 'collect.domainLookup', { domains: ['saved.com'] })
      const sent = await run(after(block), { domains: ['stripe.com', 'acme.io'] })
      const none = await run(after(block))

      expect(sent).toHaveLength(1)
      expect(sent[0]?.slug).toBe('domain-lookup')
      expect(sent[0]?.params).toContain('stripe.com')
      expect(sent[0]?.params).toContain('acme.io')
      expect(sent[0]?.params).not.toContain('saved.com')
      expect(none[0]?.params).toContain('saved.com')
   })

   it('should search for the words a call sent, and for people working at the companies it named', async () => {
      const block = node('who', 'collect.searchPeople', {
         keywords: 'saved words',
         companies: ['saved company'],
      })
      const sent = await run(after(block), {
         keywords: 'outbound sales',
         workingAt: ['Stripe'],
      })

      expect(sent[0]?.slug).toBe('profiles')
      expect(sent[0]?.params).toContain('outbound sales')
      expect(sent[0]?.params).toContain('stripe')
      expect(sent[0]?.params).not.toContain('saved words')
      expect(sent[0]?.params).not.toContain('saved company')
   })

   it('should search posts for the words a call sent', async () => {
      const block = node('posts', 'collect.findPosts', { keywords: 'saved words' })
      const sent = await run(after(block), { keywords: 'pipeline' })

      expect(sent[0]?.slug).toBe('posts')
      expect(sent[0]?.params).toContain('pipeline')
      expect(sent[0]?.params).not.toContain('saved words')
   })
})
