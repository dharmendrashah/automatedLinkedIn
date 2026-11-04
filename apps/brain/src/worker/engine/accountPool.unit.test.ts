import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accountIdsOf } from './accountPool'
import { type Context, StepError } from './context'

const mocks = vi.hoisted(() => ({ everySignedIn: vi.fn() }))

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   readSeniorities: vi.fn(),
}))
vi.mock('core/dataClient', () => ({ DataServiceError: class DataServiceError extends Error {} }))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))
vi.mock('database', () => ({
   IcpService: {},
   WalletService: {},
   WorkflowRunService: {},
   VisitPoolService: { everySignedIn: mocks.everySignedIn },
   floorMicros: () => 0,
}))

const context = (input: unknown) =>
   ({
      run: { input },
      graph: {
         nodes: [],
         edges: [],
      },
      node: {
         id: 'send',
         type: 'account.sendMessage',
         config: {
            accountMode: 'event',
            text: 'Hi',
         },
         position: {
            x: 0,
            y: 0,
         },
      },
   }) as unknown as Context

const pooled = (selectConfig: Record<string, unknown>) =>
   ({
      run: {
         input: null,
         userId: 'u1',
      },
      graph: {
         nodes: [
            {
               id: 'pool',
               type: 'account.select',
               config: selectConfig,
               position: {
                  x: 0,
                  y: 0,
               },
            },
            {
               id: 'send',
               type: 'account.sendMessage',
               config: { text: 'Hi' },
               position: {
                  x: 0,
                  y: 0,
               },
            },
         ],
         edges: [
            {
               from: 'pool',
               to: 'send',
            },
         ],
      },
      node: {
         id: 'send',
         type: 'account.sendMessage',
         config: { text: 'Hi' },
         position: {
            x: 0,
            y: 0,
         },
      },
   }) as unknown as Context

describe('the account of the event', () => {
   it('should use the account the event came from', async () => {
      await expect(
         accountIdsOf(
            context({
               delivery: 'd1',
               nodes: ['t'],
               account: 'a1',
            })
         )
      ).resolves.toEqual(['a1'])
   })

   it('should say so when the run did not start from an event', async () => {
      await expect(accountIdsOf(context(null))).rejects.toThrow(StepError)
      await expect(accountIdsOf(context({ account: null }))).rejects.toThrow('did not start from one')
   })
})

describe('the accounts of "Select accounts"', () => {
   beforeEach(() => {
      vi.resetAllMocks()
   })

   it('should use the accounts that were picked, also on a block saved before the scope existed', async () => {
      await expect(accountIdsOf(pooled({ accounts: ['a1', 'a2'] }))).resolves.toEqual(['a1', 'a2'])
      await expect(
         accountIdsOf(
            pooled({
               scope: 'pick',
               accounts: ['a3'],
            })
         )
      ).resolves.toEqual(['a3'])
      expect(mocks.everySignedIn).not.toHaveBeenCalled()
   })

   it('should use every signed-in account of the owner, up to twenty, when the scope is all', async () => {
      mocks.everySignedIn.mockResolvedValue({
         ids: ['a1', 'a2', 'a3'],
         leftOut: 0,
         notSignedIn: 1,
      })

      await expect(
         accountIdsOf(
            pooled({
               scope: 'all',
               accounts: ['ignored'],
            })
         )
      ).resolves.toEqual(['a1', 'a2', 'a3'])
      expect(mocks.everySignedIn).toHaveBeenCalledWith('u1', 20)
   })

   it('should give no account when none is signed in, so the act block says so', async () => {
      mocks.everySignedIn.mockResolvedValue({
         ids: [],
         leftOut: 0,
         notSignedIn: 2,
      })

      await expect(accountIdsOf(pooled({ scope: 'all' }))).resolves.toEqual([])
   })
})
