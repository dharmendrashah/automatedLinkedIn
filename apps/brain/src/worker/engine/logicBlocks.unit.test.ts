import { beforeEach, describe, expect, it, vi } from 'vitest'

import { person } from 'core/workflowItem'

import { type Graph } from '@automatedLinkedIn/contracts'

import { type Context, StepError, Waiting } from './context'
import { retry, taskResult, wait } from './logicBlocks'

const mocks = vi.hoisted(() => ({
   ofStep: vi.fn(),
   items: vi.fn(),
   replaceItems: vi.fn(),
   setWaitUntil: vi.fn(),
}))

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   readSeniorities: vi.fn(),
}))
vi.mock('core/dataClient', () => ({ DataServiceError: class DataServiceError extends Error {} }))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))

vi.mock('database', () => ({
   VisitPoolService: { ofStep: mocks.ofStep },
   WorkflowRunService: {
      items: mocks.items,
      replaceItems: mocks.replaceItems,
      setWaitUntil: mocks.setWaitUntil,
   },
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
}))

const node = (id: string, type: Graph['nodes'][number]['type'], config: Graph['nodes'][number]['config'] = {}) => ({
   id,
   type,
   config,
   position: {
      x: 0,
      y: 0,
   },
})

const graph = (config: Graph['nodes'][number]['config'] = {}, working = 'collect.commenters'): Graph => ({
   nodes: [
      node('work', working as Graph['nodes'][number]['type']),
      node('pause', 'logic.wait', config),
      node('result', 'logic.taskResult'),
      node('again', 'logic.retry', { times: 2 }),
   ],
   edges: [
      {
         from: 'work',
         to: 'pause',
      },
      {
         from: 'work',
         to: 'result',
      },
      {
         from: 'work',
         to: 'again',
      },
   ],
})

const ada = person({
   slug: 'ada',
   url: 'https://www.linkedin.com/in/ada',
})
const bob = person({
   slug: 'bob',
   url: 'https://www.linkedin.com/in/bob',
})

const context = (nodeId: string, inputs: Context['inputs'], overrides: Record<string, unknown> = {}, g = graph()) =>
   ({
      run: {
         id: 'r1',
         userId: 'u1',
         stopRequestedAt: null,
         steps: [
            {
               nodeId: 'work',
               round: 0,
               status: 'DONE',
               tries: 0,
            },
         ],
      },
      graph: g,
      node: g.nodes.find(({ id }) => id === nodeId),
      step: {
         id: 's1',
         round: 0,
         waitUntil: null,
         tries: 0,
      },
      at: {
         runId: 'r1',
         nodeId,
         round: 0,
      },
      inputs,
      preview: false,
      deps: { log: { info: vi.fn() } },
      ...overrides,
   }) as unknown as Context

const kept = (call = 0) => mocks.replaceItems.mock.calls[call]?.[1] as { slug: string }[]

describe('Wait', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should pick its time once, save it, and give the step back until it has passed', async () => {
      const g = graph({
         mode: 'between',
         minAmount: 20,
         maxAmount: 60,
      })
      const before = Date.now()

      await expect(wait(context('pause', [ada], {}, g))).rejects.toBeInstanceOf(Waiting)

      const [[, at]] = mocks.setWaitUntil.mock.calls

      expect(at.getTime()).toBeGreaterThanOrEqual(before + 20_000)
      expect(at.getTime()).toBeLessThanOrEqual(Date.now() + 60_000)

      await expect(
         wait(
            context(
               'pause',
               [ada],
               {
                  step: {
                     id: 's1',
                     round: 0,
                     waitUntil: new Date(Date.now() + 5_000),
                     tries: 0,
                  },
               },
               g
            )
         )
      ).rejects.toBeInstanceOf(Waiting)
      expect(mocks.setWaitUntil).toHaveBeenCalledTimes(1)
   })

   it('should wait exactly the seconds it is set to', async () => {
      await expect(
         wait(
            context(
               'pause',
               [ada],
               {},
               graph({
                  mode: 'exact',
                  amount: 90,
               })
            )
         )
      ).rejects.toBeInstanceOf(Waiting)

      const [[, at]] = mocks.setWaitUntil.mock.calls

      expect(Math.round((at.getTime() - Date.now()) / 1000)).toBe(90)
   })

   it.each([
      ['minutes', 2, 120],
      ['hours', 3, 10_800],
      ['days', 2, 172_800],
      ['weeks', 1, 604_800],
   ])('should wait %s in the unit it is set to', async (unit, amount, seconds) => {
      await expect(
         wait(
            context(
               'pause',
               [ada],
               {},
               graph({
                  unit,
                  amount,
               })
            )
         )
      ).rejects.toBeInstanceOf(Waiting)

      const [[, at]] = mocks.setWaitUntil.mock.calls

      expect(Math.round((at.getTime() - Date.now()) / 1000)).toBe(seconds)
   })

   it('should pick a range in days to the second and keep it inside the range', async () => {
      await expect(
         wait(
            context(
               'pause',
               [ada],
               {},
               graph({
                  mode: 'between',
                  unit: 'days',
                  minAmount: 2,
                  maxAmount: 3,
               })
            )
         )
      ).rejects.toBeInstanceOf(Waiting)

      const [[, at]] = mocks.setWaitUntil.mock.calls
      const waited = (at.getTime() - Date.now()) / 1000

      expect(waited).toBeGreaterThanOrEqual(172_800 - 1)
      expect(waited).toBeLessThanOrEqual(259_200)
   })

   it('should pass every item on once its time has passed', async () => {
      const result = await wait(
         context('pause', [ada, bob], {
            step: {
               id: 's1',
               round: 0,
               waitUntil: new Date(Date.now() - 1_000),
               tries: 0,
            },
         })
      )

      expect(kept().map(({ slug }) => slug)).toEqual(['ada', 'bob'])
      expect(result).toMatchObject({
         status: 'DONE',
         itemsIn: 2,
         itemsOut: 2,
      })
   })

   it('should not wait in a preview, and end the wait when the owner stopped the run', async () => {
      const preview = await wait(context('pause', [ada], { preview: true }))

      expect(mocks.setWaitUntil).not.toHaveBeenCalled()
      expect(preview.message).toContain('A preview does not wait')

      const stopped = await wait(
         context('pause', [ada], {
            run: {
               id: 'r1',
               userId: 'u1',
               stopRequestedAt: new Date(),
               steps: [],
            },
         })
      )

      expect(stopped.message).toContain('Stopped by you')
   })
})

describe('Task result and Retry', () => {
   beforeEach(() => {
      vi.resetAllMocks()
      mocks.items.mockResolvedValue([])
   })

   it('should answer yes for everything when a block that does not look at people worked', async () => {
      const result = await taskResult(context('result', [ada, bob]))

      expect(kept(0).map(({ slug }) => slug)).toEqual([])
      expect(kept(1).map(({ slug }) => slug)).toEqual(['ada', 'bob'])
      expect(result).toMatchObject({
         status: 'DONE',
         itemsIn: 2,
         itemsOut: 2,
      })
   })

   it('should answer no, with what reached the failed block, when it failed', async () => {
      mocks.items.mockResolvedValue([ada, bob])

      const result = await taskResult(
         context('result', [], {
            run: {
               id: 'r1',
               userId: 'u1',
               stopRequestedAt: null,
               steps: [
                  {
                     nodeId: 'work',
                     round: 0,
                     status: 'FAILED',
                     tries: 0,
                  },
               ],
            },
         })
      )

      expect(mocks.items).toHaveBeenCalledWith('r1', [
         {
            nodeId: 'work~failed',
            round: 0,
         },
      ])
      expect(mocks.replaceItems.mock.calls[0]?.[0]).toMatchObject({ nodeId: 'result~else' })
      expect(kept(0).map(({ slug }) => slug)).toEqual(['ada', 'bob'])
      expect(kept(1)).toEqual([])
      expect(result).toMatchObject({
         status: 'DONE',
         itemsOut: 0,
      })
   })

   it('should split people of a visit block by whether the visit went through', async () => {
      mocks.ofStep.mockResolvedValue([
         {
            slug: 'ada',
            status: 'DONE',
         },
         {
            slug: 'bob',
            status: 'FAILED',
         },
      ])

      const g: Graph = {
         nodes: [node('work', 'account.visitProfile'), node('result', 'logic.taskResult')],
         edges: [
            {
               from: 'work',
               to: 'result',
            },
         ],
      }

      await taskResult(context('result', [ada, bob], {}, g))

      expect(mocks.ofStep).toHaveBeenCalledWith('r1', 'work')
      expect(kept(0).map(({ slug }) => slug)).toEqual(['bob'])
      expect(kept(1).map(({ slug }) => slug)).toEqual(['ada'])
   })

   it('should pass on what the block before a Retry gave, and say which try worked', async () => {
      const result = await retry(
         context('again', [ada], {
            run: {
               id: 'r1',
               userId: 'u1',
               stopRequestedAt: null,
               steps: [
                  {
                     nodeId: 'work',
                     round: 0,
                     status: 'DONE',
                     tries: 1,
                  },
               ],
            },
         })
      )

      expect(kept().map(({ slug }) => slug)).toEqual(['ada'])
      expect(result.message).toContain('try 2')
   })

   it('should send what reached the block to the Else side after the last try failed', async () => {
      mocks.items.mockResolvedValue([ada])

      await retry(
         context('again', [], {
            run: {
               id: 'r1',
               userId: 'u1',
               stopRequestedAt: null,
               steps: [
                  {
                     nodeId: 'work',
                     round: 0,
                     status: 'FAILED',
                     tries: 2,
                  },
               ],
            },
         })
      )

      expect(mocks.replaceItems.mock.calls[0]?.[0]).toMatchObject({ nodeId: 'again~else' })
      expect(kept(0).map(({ slug }) => slug)).toEqual(['ada'])
   })

   it('should fail, plainly, when there is no block before it to look at', async () => {
      const g: Graph = {
         nodes: [node('result', 'logic.taskResult')],
         edges: [],
      }

      await expect(taskResult(context('result', [ada], {}, g))).rejects.toBeInstanceOf(StepError)
   })
})
