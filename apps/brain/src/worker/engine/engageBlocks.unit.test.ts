import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type PostItem } from 'core/workflowItem'

import { type Graph } from '@automatedLinkedIn/contracts'

import { type Context } from './context'
import { reactToPosts } from './engageBlocks'

const mocks = vi.hoisted(() => ({
   plan: vi.fn(),
   ofStep: vi.fn(),
   ask: vi.fn(),
   replaceItems: vi.fn(),
}))

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   ...(await vi.importActual<object>('core/linkedInUrl')),
   readSeniorities: vi.fn(),
}))
vi.mock('core/dataClient', () => ({ DataServiceError: class DataServiceError extends Error {} }))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))

vi.mock('database', () => ({
   LinkedInEngageService: { plan: mocks.plan },
   AccountActionService: {
      ofStep: mocks.ofStep,
      ask: mocks.ask,
   },
   WorkflowRunService: { replaceItems: mocks.replaceItems },
   IcpService: {},
   WalletService: {},
   VisitPoolService: {},
   floorMicros: () => 0,
}))

type Settings = Record<string, string | number | boolean | string[]>

const post = (slug: string, fields: Partial<PostItem> = {}): PostItem => ({
   kind: 'post',
   slug,
   url: `https://www.linkedin.com/feed/update/urn:li:activity:${slug}`,
   postId: null,
   author: `https://www.linkedin.com/in/${slug}-author`,
   ...fields,
})

const graph = (settings: Settings): Graph => ({
   nodes: [
      {
         id: 'n1',
         type: 'account.reactToPost',
         config: settings,
         position: {
            x: 0,
            y: 0,
         },
      },
   ],
   edges: [],
})

const context = (inputs: PostItem[], overrides: { preview?: boolean; settings?: Settings } = {}): Context => {
   const built = graph(overrides.settings ?? {})

   return {
      run: {
         id: 'r1',
         userId: 'u1',
         workflowId: 'w1',
         stopRequestedAt: null,
      },
      graph: built,
      node: built.nodes[0],
      step: { id: 's1' },
      at: {
         runId: 'r1',
         nodeId: 'n1',
         round: 0,
      },
      inputs,
      preview: overrides.preview ?? false,
      deps: { log: { info: vi.fn() } },
   } as unknown as Context
}

const ids = (call: number) =>
   (
      mocks.replaceItems.mock.calls[call]?.[1] as { slug: string; result: { status: string; reason: string | null } }[]
   ).map(({ slug, result }) => `${slug}:${result.status}:${result.reason}`)

const planned = (accountId = 'a1') => ({
   status: 'PLANNED',
   reason: null,
   accountId,
   reaction: 'like',
})

beforeEach(() => {
   vi.resetAllMocks()
   mocks.ofStep.mockResolvedValue([])
})

describe('reactToPosts', () => {
   it('should plan the posts for real and send the rest to Else with their reasons', async () => {
      mocks.plan.mockResolvedValue(
         new Map<string, unknown>([
            ['https://www.linkedin.com/feed/update/urn:li:activity:1', planned()],
            [
               'https://www.linkedin.com/feed/update/urn:li:activity:2',
               {
                  status: 'SKIPPED',
                  reason: 'No invite from your accounts.',
                  accountId: null,
                  reaction: null,
               },
            ],
         ])
      )

      const result = await reactToPosts(context([post('1'), post('2')], { settings: { actForReal: true } }))

      expect(mocks.plan).toHaveBeenCalledWith(
         'u1',
         expect.objectContaining({
            accounts: { mode: 'inviter' },
            dryRun: false,
            wish: {
               act: 'REACT',
               reactions: ['like'],
            },
            origin: {
               workflowId: 'w1',
               runId: 'r1',
               nodeId: 'n1',
            },
         })
      )
      expect(mocks.ask).toHaveBeenCalledWith(
         'r1',
         'n1',
         '1',
         'a1',
         'DONE',
         expect.objectContaining({ status: 'PLANNED' })
      )
      expect(ids(0)).toEqual(['2:SKIPPED:No invite from your accounts.'])
      expect(ids(1)).toEqual(['1:PLANNED:null'])
      expect(result.message).toContain('2 in, 1 planned, 1 to Else')
   })

   it('should queue nothing in a preview, or while Act for real is off, and still say what would happen', async () => {
      mocks.plan.mockResolvedValue(new Map([['https://www.linkedin.com/feed/update/urn:li:activity:1', planned()]]))

      await reactToPosts(
         context([post('1')], {
            preview: true,
            settings: { actForReal: true },
         })
      )
      await reactToPosts(context([post('1')]))

      for (const [, request] of mocks.plan.mock.calls) {
         expect(request).toMatchObject({ dryRun: true })
         expect(request).not.toHaveProperty('origin')
      }

      expect(ids(1)).toEqual(['1:NOT_ASKED:A preview reacts to nothing.'])
      expect(ids(3)).toEqual(['1:NOT_ASKED:Act for real is off.'])
      expect(mocks.ask).not.toHaveBeenCalled()
   })

   it('should leave a post whose author is not known to Else, and not ask the queue about it', async () => {
      mocks.plan.mockResolvedValue(new Map())

      await reactToPosts(context([post('1', { author: null })], { settings: { actForReal: true } }))

      expect(mocks.plan.mock.calls[0]?.[1].candidates).toEqual([])
      expect(ids(0)).toEqual(['1:SKIPPED:The author of the post is not known.'])
   })

   it('should not plan again what an earlier pass of the step planned', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            slug: '1',
            accountId: 'a1',
            result: { status: 'PLANNED' },
         },
      ])
      mocks.plan.mockResolvedValue(new Map())

      await reactToPosts(context([post('1')], { settings: { actForReal: true } }))

      expect(mocks.plan.mock.calls[0]?.[1].candidates).toEqual([])
      expect(ids(1)).toEqual(['1:PLANNED:null'])
   })

   it('should use the author of the person the posts were asked for before the link on the post', async () => {
      mocks.plan.mockResolvedValue(new Map())

      await reactToPosts(context([post('1', { authorSlug: 'ada' })]))

      expect(mocks.plan.mock.calls[0]?.[1].candidates[0]).toMatchObject({ slug: 'ada' })
   })
})
