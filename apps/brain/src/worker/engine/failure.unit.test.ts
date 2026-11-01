import { describe, expect, it, vi } from 'vitest'

import { DataServiceError } from 'core/dataClient'

import { StepError } from './context'
import { PLAIN_FAILURE, failureOf } from './failure'

vi.mock('env', () => ({}))

vi.mock('core', async () => ({
   ...(await vi.importActual<object>('core/workflowItem')),
   readSeniorities: vi.fn(),
}))
vi.mock('core/dataJob', () => ({ advanceJob: vi.fn() }))

vi.mock('database', () => ({
   WorkflowRunService: {},
   IcpService: {},
   WalletService: {},
   floorMicros: () => 0,
}))

describe('failureOf', () => {
   it('should keep the sentence and the code of a step error', () => {
      expect(failureOf(new StepError('Pick an ideal customer.', 'ICP_DELETED'))).toEqual({
         message: 'Pick an ideal customer.',
         errorCode: 'ICP_DELETED',
      })
   })

   it('should explain each kind of data service failure with its own code', () => {
      expect(failureOf(new DataServiceError('CONFIG', 'key refused')).errorCode).toBe('DATA_NOT_CONFIGURED')
      expect(failureOf(new DataServiceError('BAD_REQUEST', '422: bad')).errorCode).toBe('DATA_REJECTED')
      expect(failureOf(new DataServiceError('UNAVAILABLE', '502')).errorCode).toBe('DATA_UNAVAILABLE')
      expect(failureOf(new DataServiceError('BALANCE', 'empty')).errorCode).toBe('WALLET_LOW')
   })

   it('should never show the raw error text of a data service failure', () => {
      const failure = failureOf(new DataServiceError('BAD_REQUEST', '422: secret detail from the supplier'))

      expect(failure.message).not.toContain('secret detail')
      expect(failure.message.toLowerCase()).not.toMatch(/mindcase|apify/)
   })

   it('should call anything else unexpected and say the platform owner has been told', () => {
      expect(failureOf(new Error('boom'))).toEqual({
         message: PLAIN_FAILURE,
         errorCode: 'UNEXPECTED',
      })
      expect(failureOf('weird')).toMatchObject({ errorCode: 'UNEXPECTED' })
   })
})
