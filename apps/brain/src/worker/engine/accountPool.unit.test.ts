import { describe, expect, it, vi } from 'vitest'

import { accountIdsOf } from './accountPool'
import { type Context, StepError } from './context'

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

describe('the account of the event', () => {
   it('should use the account the event came from', () => {
      expect(
         accountIdsOf(
            context({
               delivery: 'd1',
               nodes: ['t'],
               account: 'a1',
            })
         )
      ).toEqual(['a1'])
   })

   it('should say so when the run did not start from an event', () => {
      expect(() => accountIdsOf(context(null))).toThrow(StepError)
      expect(() => accountIdsOf(context({ account: null }))).toThrow('did not start from one')
   })
})
