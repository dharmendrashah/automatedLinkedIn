import { describe, expect, it } from 'vitest'

import { RUNNER_VERDICTS } from '@automatedLinkedIn/contracts'

import { RUNNER_CODES } from './event'

describe('RUNNER_CODES', () => {
   it('should be exactly the runner verdicts, so a new verdict cannot miss the logs', () => {
      expect([...RUNNER_CODES].sort()).toEqual(Object.keys(RUNNER_VERDICTS).sort())
   })
})
