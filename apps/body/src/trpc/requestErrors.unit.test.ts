import { logToConsole } from '@automatedLinkedIn/logger/browser'
import { describe, expect, it, vi } from 'vitest'

import { reportFailedRequest, stampCorrelation } from './requestErrors'

vi.mock('@automatedLinkedIn/logger/browser', () => ({ logToConsole: vi.fn() }))

describe('stampCorrelation', () => {
   it('should give every operation of a batch the ID the request is sent with', () => {
      const opList: Array<{ path: string; context: Record<string, unknown> }> = [
         { path: 'me.get', context: {} },
         { path: 'people.list', context: {} },
      ]

      stampCorrelation(opList, 'request-1')

      expect(opList.map(({ context }) => context.correlationId)).toEqual(['request-1', 'request-1'])
   })
})

describe('reportFailedRequest', () => {
   it('should log the failed request as BODY_ERROR with the ID it was sent with', () => {
      const error = new Error('internal error')

      reportFailedRequest({ path: 'me.get', context: { correlationId: 'request-1' } }, error)

      expect(logToConsole).toHaveBeenCalledWith('body', 'error', 'Request failed: me.get', {
         code: 'BODY_ERROR',
         correlationId: 'request-1',
         path: 'me.get',
         error,
      })
   })
})
