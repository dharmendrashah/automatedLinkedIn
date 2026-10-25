import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type Graph } from '@automatedLinkedIn/contracts'

import { type Context, StepError, Waiting } from './context'
import { writePost } from './writePost'

const mocks = vi.hoisted(() => {
   class TaskRefusedError extends Error {}

   return {
      TaskRefusedError,
      accounts: vi.fn(),
      lastPosts: vi.fn(),
      ofStep: vi.fn(),
      publishFromBlock: vi.fn(),
      replaceItems: vi.fn(),
   }
})

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   readSeniorities: vi.fn(),
}))
vi.mock('core/dataClient', () => ({ DataServiceError: class DataServiceError extends Error {} }))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))

vi.mock('database', async () => ({
   idleFirst: (await vi.importActual<{ idleFirst: unknown }>('database/visitPool')).idleFirst,
   TaskRefusedError: mocks.TaskRefusedError,
   PostPublicationService: {
      ofStep: mocks.ofStep,
      lastPosts: mocks.lastPosts,
      publishFromBlock: mocks.publishFromBlock,
   },
   VisitPoolService: { accounts: mocks.accounts },
   WorkflowRunService: { replaceItems: mocks.replaceItems },
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
}))

const HOUR_MS = 60 * 60 * 1000
const BLOCKS = [
   {
      id: 't1',
      type: 'TEXT',
      text: 'Hello',
   },
]

const node = (id: string, type: Graph['nodes'][number]['type'], config: Graph['nodes'][number]['config'] = {}) => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const graph = (post = JSON.stringify(BLOCKS)): Graph => ({
   nodes: [node('pool', 'account.select', { accounts: ['a1', 'a2'] }), node('write', 'account.writePost', { post })],
   edges: [
      {
         from: 'pool',
         to: 'write',
      },
   ],
})

const ada = person({
   slug: 'ada',
   url: 'https://www.linkedin.com/in/ada',
})

const context = (overrides: Partial<Context> & { post?: string; tries?: number; startedAt?: Date } = {}) => {
   const { post, tries = 0, startedAt = new Date(), ...rest } = overrides
   const built = graph(post)

   return {
      run: {
         id: 'r1',
         userId: 'u1',
         startedAt: new Date(),
         stopRequestedAt: null,
      },
      graph: built,
      node: built.nodes.find(({ id }) => id === 'write'),
      step: {
         id: 's1',
         tries,
         startedAt,
      },
      at: {
         runId: 'r1',
         nodeId: 'write',
         round: 0,
      },
      inputs: [ada],
      preview: false,
      deps: { log: { info: vi.fn() } },
      ...rest,
   } as unknown as Context
}

const active = (...ids: string[]) =>
   ids.map(id => ({
      id,
      status: 'ACTIVE',
   }))

const kept = () => mocks.replaceItems.mock.calls[0]?.[1] as { slug: string }[]

describe('writePost', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.accounts.mockResolvedValue(active('a1', 'a2'))
      mocks.lastPosts.mockResolvedValue(new Map())
      mocks.ofStep.mockResolvedValue([])
      mocks.publishFromBlock.mockResolvedValue({ id: 'p1' })
   })

   it('should post once from the account that went longest without a post, and wait for the result', async () => {
      mocks.lastPosts.mockResolvedValue(new Map([['a1', new Date('2020-10-25T10:00:00Z')]]))

      await expect(writePost(context())).rejects.toBeInstanceOf(Waiting)

      expect(mocks.publishFromBlock).toHaveBeenCalledTimes(1)
      expect(mocks.publishFromBlock).toHaveBeenCalledWith('u1', 'a2', BLOCKS, {
         runId: 'r1',
         nodeId: 'write',
      })
   })

   it('should try the next account when one cannot take the post, and fail with the last sentence when none can', async () => {
      mocks.publishFromBlock
         .mockRejectedValueOnce(new mocks.TaskRefusedError('Another post is less than an hour away.'))
         .mockResolvedValueOnce({ id: 'p1' })

      await expect(writePost(context())).rejects.toBeInstanceOf(Waiting)
      expect(mocks.publishFromBlock.mock.calls.map(call => call[1])).toEqual(['a1', 'a2'])

      mocks.publishFromBlock.mockReset().mockRejectedValue(new mocks.TaskRefusedError('Not today.'))

      await expect(writePost(context())).rejects.toThrow(new StepError('Not today.'))
   })

   it('should fail when no account is before it, none is signed in, or the post cannot be read', async () => {
      const lonely = context()

      lonely.graph = {
         nodes: [lonely.node],
         edges: [],
      }

      await expect(writePost(lonely)).rejects.toThrow('needs "Select accounts"')

      mocks.accounts.mockResolvedValue([
         {
            id: 'a1',
            status: 'PAUSED',
         },
      ])
      await expect(writePost(context())).rejects.toThrow('need to be signed in')
      await expect(writePost(context({ post: 'not json' }))).rejects.toThrow('cannot be read')
      expect(mocks.publishFromBlock).not.toHaveBeenCalled()
   })

   it('should post nothing in a preview, and pass on what reached it', async () => {
      const result = await writePost(context({ preview: true }))

      expect(mocks.publishFromBlock).not.toHaveBeenCalled()
      expect(result).toMatchObject({
         status: 'DONE',
         message: 'A preview posts nothing.',
      })
      expect(kept().map(({ slug }) => slug)).toEqual(['ada'])
   })

   it('should wait while the post is on its way, and never post a second time', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            id: 'p1',
            state: 'SENDING',
            failure: null,
            link: null,
         },
      ])

      await expect(writePost(context())).rejects.toBeInstanceOf(Waiting)
      expect(mocks.publishFromBlock).not.toHaveBeenCalled()
   })

   it('should pass on what reached it once the post went, with its link', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            id: 'p1',
            state: 'POSTED',
            failure: null,
            link: 'https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/',
         },
      ])

      const result = await writePost(context())

      expect(result).toMatchObject({
         status: 'DONE',
         itemsIn: 1,
         itemsOut: 1,
      })
      expect(result.message).toContain('https://www.linkedin.com/feed/update/urn:li:activity:7520195721216827392/')
      expect(kept().map(({ slug }) => slug)).toEqual(['ada'])
   })

   it('should fail the step with the sentence of a post that did not go, so Retry and Task result can handle it', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            id: 'p1',
            state: 'FAILED',
            failure: 'It could not start in time. Nothing was posted.',
            link: null,
         },
      ])

      await expect(writePost(context())).rejects.toThrow('Nothing was posted.')
      expect(mocks.publishFromBlock).not.toHaveBeenCalled()
   })

   it('should post again only when a Retry gave the step another try after a post that did not go', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            id: 'p1',
            state: 'FAILED',
            failure: 'Nothing was posted.',
            link: null,
         },
      ])

      await expect(writePost(context({ tries: 1 }))).rejects.toBeInstanceOf(Waiting)
      expect(mocks.publishFromBlock).toHaveBeenCalledTimes(1)
   })

   it('should never post again after a post that may have gone, even when a Retry asks', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            id: 'p1',
            state: 'UNKNOWN',
            failure: 'Check your posts on LinkedIn before posting it again.',
            link: null,
         },
      ])

      await expect(writePost(context({ tries: 1 }))).rejects.toThrow('Check your posts')
      expect(mocks.publishFromBlock).not.toHaveBeenCalled()
   })

   it('should pass on after an hour, and when the owner stopped the run, leaving the post to go on by itself', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            id: 'p1',
            state: 'QUEUED',
            failure: null,
            link: null,
         },
      ])

      const late = await writePost(context({ startedAt: new Date(Date.now() - 2 * HOUR_MS) }))

      expect(late.status).toBe('PARTIAL')
      expect(late.message).toContain('still being posted')

      mocks.replaceItems.mockClear()

      const stopped = await writePost(
         context({
            run: {
               id: 'r1',
               userId: 'u1',
               startedAt: new Date(),
               stopRequestedAt: new Date(),
            },
         } as Partial<Context>)
      )

      expect(stopped.status).toBe('PARTIAL')
      expect(stopped.message).toContain('Stopped by you')
   })
})
