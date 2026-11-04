import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type GraphNode } from '@automatedLinkedIn/contracts'

import { type Context } from './context'
import { getFeed, getMutual, getNotifications, getViewers } from './ownPageBlocks'

const mocks = vi.hoisted(() => ({
   everySignedIn: vi.fn(),
   notifications: vi.fn(),
   viewers: vi.fn(),
   feed: vi.fn(),
   mutual: vi.fn(),
   replaceItems: vi.fn(),
}))

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   readSeniorities: (values: string[]) => values,
}))
vi.mock('core/dataClient', () => ({ DataServiceError: class DataServiceError extends Error {} }))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))

vi.mock('database', () => ({
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
   PersonStateService: {},
   VisitPoolService: { everySignedIn: mocks.everySignedIn },
   WorkflowRunService: { replaceItems: mocks.replaceItems },
   OwnPagesService: {
      notifications: mocks.notifications,
      viewers: mocks.viewers,
      feed: mocks.feed,
      mutual: mocks.mutual,
   },
}))

const NOW = new Date('2026-11-01T12:00:00Z')
const DAY_MS = 86_400_000

const context = (type: GraphNode['type'], config: GraphNode['config'], inputs: unknown[] = []) =>
   ({
      run: {
         id: 'r1',
         userId: 'u1',
      },
      graph: {
         nodes: [],
         edges: [],
      },
      node: {
         id: 'n1',
         type,
         config,
         position: {
            x: 0,
            y: 0,
         },
      },
      step: { id: 's1' },
      at: {
         runId: 'r1',
         nodeId: 'n1',
         round: 0,
      },
      inputs,
      preview: false,
      deps: {},
   }) as unknown as Context

type Saved = Array<{ slug: string; facts?: Record<string, unknown>; result?: { reason: string | null } }>

const kept = () => mocks.replaceItems.mock.calls.at(-1)?.[1] as Saved

beforeEach(() => {
   vi.resetAllMocks()
   mocks.everySignedIn.mockResolvedValue({ ids: ['a1', 'a2'] })
})

describe('getNotifications', () => {
   it('should give a person for each slug the stored notifications name, with the kinds and the count', async () => {
      mocks.notifications.mockResolvedValue({
         rows: 5,
         people: new Map([
            [
               'ada',
               {
                  kinds: ['viewed', 'reacted'],
                  count: 2,
               },
            ],
         ]),
      })

      const result = await getNotifications(
         context('account.getNotifications', {
            since: '24h',
            kinds: ['viewed', 'engaged'],
         }),
         NOW
      )

      expect(mocks.notifications).toHaveBeenCalledWith('u1', ['a1', 'a2'], new Date(NOW.getTime() - DAY_MS), [
         'viewed',
         'reacted',
         'commented',
      ])
      expect(kept()).toEqual([
         expect.objectContaining({
            slug: 'ada',
            facts: {
               'notification.kinds': 'viewed, reacted',
               'notification.count': 2,
            },
         }),
      ])
      expect(result.message).toBe('2 accounts, 5 notifications, 1 person.')
   })

   it('should ask for nothing and give no one when no account is signed in or no kind is chosen', async () => {
      mocks.everySignedIn.mockResolvedValue({ ids: [] })

      const none = await getNotifications(context('account.getNotifications', {}), NOW)

      expect(none.message).toBe('0 accounts, 0 notifications, 0 people.')

      mocks.everySignedIn.mockResolvedValue({ ids: ['a1'] })
      await getNotifications(context('account.getNotifications', { kinds: [] }), NOW)

      expect(mocks.notifications).not.toHaveBeenCalled()
   })
})

describe('getViewers', () => {
   it('should give the people the page named, and say when only groups were counted', async () => {
      mocks.viewers.mockResolvedValue({
         people: ['ada'],
         groups: 0,
      })

      expect((await getViewers(context('account.getViewers', {}), NOW)).message).toBe('2 accounts, 1 person.')
      expect(kept().map(({ slug }) => slug)).toEqual(['ada'])

      mocks.viewers.mockResolvedValue({
         people: [],
         groups: 13,
      })

      expect((await getViewers(context('account.getViewers', {}), NOW)).message).toContain(
         '13 viewers were only counted in groups'
      )
   })
})

describe('getFeed', () => {
   it('should give the authors seen in the feed with the kind, and say when nothing was seen', async () => {
      mocks.feed.mockResolvedValue({
         posts: 4,
         authors: new Map([['ada', 'lifeEvent']]),
      })

      const result = await getFeed(context('account.getFeed', { show: 'life' }), NOW)

      expect(mocks.feed.mock.calls[0]?.[3]).toEqual(['lifeEvent'])
      expect(kept()[0].facts).toEqual({ 'feed.kind': 'lifeEvent' })
      expect(result.message).toBe('2 accounts, 4 posts seen, 1 author.')

      mocks.feed.mockResolvedValue({
         posts: 0,
         authors: new Map(),
      })

      expect((await getFeed(context('account.getFeed', {}), NOW)).message).toBe('No posts seen.')
   })
})

describe('getMutual', () => {
   const who = (slug: string) =>
      person({
         slug,
         url: `https://www.linkedin.com/in/${slug}`,
      })

   it('should add the stored count to people with a read and send the rest to Else', async () => {
      mocks.mutual.mockResolvedValue(
         new Map([
            [
               'ada',
               {
                  count: 4,
                  mutual: ['bob', 'cy'],
               },
            ],
         ])
      )

      const result = await getMutual(context('account.getMutual', {}, [who('ada'), who('dee')]))
      const [rest, main] = mocks.replaceItems.mock.calls.map(call => call[1] as Saved)

      expect(main).toEqual([
         expect.objectContaining({
            slug: 'ada',
            facts: {
               'mutual.count': 4,
               'mutual.first': 'bob',
            },
         }),
      ])
      expect(rest.map(({ slug, result: why }) => [slug, why?.reason])).toEqual([['dee', 'Not read yet.']])
      expect(result.message).toBe('2 in, 1 with a stored read, 1 to Else.')
   })
})
