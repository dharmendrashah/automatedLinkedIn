import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDiscovery, discoveredModules } from './discovery'

const credentials = {
   token: 'T',
   namespace: 'automatedlinkedin',
   ca: 'CA',
}

const workload = (
   name: string,
   {
      replicas = 1,
      ready = 1,
      annotations,
   }: { replicas?: number; ready?: number; annotations?: Record<string, string> } = {}
) => ({
   metadata: {
      name,
      ...(annotations && { annotations }),
   },
   spec: { replicas },
   status: ready > 0 ? { readyReplicas: ready } : {},
})

const api = (deployments: unknown[], statefulsets: unknown[] = []) => ({
   credentials: vi.fn(async () => credentials),
   get: vi.fn(async (path: string) => ({
      status: 200,
      body: JSON.stringify({ items: path.endsWith('/statefulsets') ? statefulsets : deployments }),
   })),
})

beforeEach(() => {
   vi.useFakeTimers()
})

afterEach(() => {
   vi.useRealTimers()
})

describe('createDiscovery', () => {
   it('should say it is off, and ask nothing, outside Kubernetes', async () => {
      const used = {
         credentials: vi.fn(async () => null),
         get: vi.fn(),
      }

      await expect(createDiscovery(used as never)()).resolves.toEqual({ kind: 'off' })
      expect(used.get).not.toHaveBeenCalled()
   })

   it("should list the namespace's deployments and stateful sets, sorted by name", async () => {
      const used = api([workload('spider-api'), workload('body')], [workload('rabbitmq')])

      const result = await createDiscovery(used as never)()

      expect(used.get.mock.calls.map(([path]) => path).sort()).toEqual([
         '/apis/apps/v1/namespaces/automatedlinkedin/deployments',
         '/apis/apps/v1/namespaces/automatedlinkedin/statefulsets',
      ])
      expect(result.kind === 'workloads' && result.workloads.map(item => item.name)).toEqual([
         'body',
         'rabbitmq',
         'spider-api',
      ])
   })

   it.each([
      ['a ready pod', { ready: 1 }, { state: 'live' }],
      [
         'no ready pod',
         { ready: 0 },
         {
            state: 'dead',
            reason: 'No pod is ready',
         },
      ],
      [
         'no pods wanted',
         {
            replicas: 0,
            ready: 0,
         },
         {
            state: 'unknown',
            reason: 'Switched off',
         },
      ],
   ])('should read %s as its state', async (_name, options, expected) => {
      const result = await createDiscovery(api([workload('x', options)]) as never)()

      expect(result.kind === 'workloads' && result.workloads[0]).toMatchObject(expected)
   })

   it('should take the title, group and description from the annotations on the workload', async () => {
      const result = await createDiscovery(
         api([
            workload('authentik-worker', {
               annotations: {
                  'status.automatedlinkedin/title': 'Sign-in worker',
                  'status.automatedlinkedin/group': 'Sign-in',
                  'status.automatedlinkedin/description': 'Background work for sign-in',
               },
            }),
         ]) as never
      )()

      expect(result.kind === 'workloads' && result.workloads[0]).toMatchObject({
         title: 'Sign-in worker',
         group: 'Sign-in',
         description: 'Background work for sign-in',
      })
   })

   it('should still show a workload nobody described, under its own name', async () => {
      const result = await createDiscovery(api([workload('new-service')]) as never)()

      expect(result.kind === 'workloads' && result.workloads[0]).toMatchObject({
         name: 'new-service',
         title: 'New service',
         group: 'Other services',
         description: 'A service running in the cluster',
      })
   })

   it('should leave out a workload that asks to be hidden', async () => {
      const result = await createDiscovery(
         api([
            workload('shown'),
            workload('hidden', { annotations: { 'status.automatedlinkedin/hide': 'true' } }),
         ]) as never
      )()

      expect(result.kind === 'workloads' && result.workloads.map(item => item.name)).toEqual(['shown'])
   })

   it.each([
      [
         'a refused request',
         {
            get: vi.fn(async () => ({
               status: 403,
               body: '{}',
            })),
         },
      ],
      [
         'an answer that is not JSON',
         {
            get: vi.fn(async () => ({
               status: 200,
               body: 'oops',
            })),
         },
      ],
      ['a failure', { get: vi.fn(async () => Promise.reject(new Error('socket hang up'))) }],
   ])('should say it failed, never an empty list, on %s', async (_name, overrides) => {
      const result = await createDiscovery({
         ...api([]),
         ...overrides,
      } as never)()

      expect(result).toEqual({ kind: 'failed' })
   })

   it('should ask Kubernetes at most once every ten seconds, and once for callers that arrive together', async () => {
      const used = api([workload('x')])
      const discover = createDiscovery(used as never)

      await Promise.all([discover(), discover(), discover()])
      expect(used.get).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(9000)
      await discover()
      expect(used.get).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(2000)
      await discover()
      expect(used.get).toHaveBeenCalledTimes(4)
   })
})

describe('discoveredModules', () => {
   const found = {
      kind: 'workloads' as const,
      workloads: [
         {
            name: 'body',
            title: 'Body',
            group: 'Other services',
            description: 'd',
            state: 'live' as const,
         },
         {
            name: 'new-service',
            title: 'New service',
            group: 'Other services',
            description: 'A service running in the cluster',
            state: 'dead' as const,
            reason: 'No pod is ready',
         },
      ],
   }

   it('should add a card for every workload the explicit checks do not already cover', async () => {
      const modules = discoveredModules(found, new Set(['body']))

      expect(modules.map(item => [item.key, item.group, item.name])).toEqual([
         ['k8s:new-service', 'Other services', 'New service'],
      ])
      await expect(modules[0].check()).resolves.toEqual({
         state: 'dead',
         reason: 'No pod is ready',
      })
   })

   it('should add nothing outside Kubernetes', () => {
      expect(discoveredModules({ kind: 'off' }, new Set())).toEqual([])
   })

   it('should show one unknown card when Kubernetes could not be asked, so the missing cards are not a surprise', async () => {
      const [card, ...rest] = discoveredModules({ kind: 'failed' }, new Set())

      expect(rest).toEqual([])
      expect(card).toMatchObject({
         key: 'k8s',
         name: 'Service discovery',
      })
      await expect(card.check()).resolves.toEqual({
         state: 'unknown',
         reason: 'Could not ask Kubernetes',
      })
   })
})
