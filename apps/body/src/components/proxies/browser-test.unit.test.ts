import { describe, expect, it } from 'vitest'

import { browserTestBlocker } from './browser-test'

describe('browserTestBlocker', () => {
   it.each(['ACTIVE', 'GEO_MISMATCH'] as const)('should let a %s proxy be browser tested', status => {
      expect(browserTestBlocker(status, true)).toBeUndefined()
   })

   it.each(['PENDING', 'UNREACHABLE', 'DISABLED'] as const)(
      'should say why a %s proxy cannot be browser tested',
      status => {
         expect(browserTestBlocker(status, true)).toBe(
            'Test the proxy first: the browser test needs a proxy that works.'
         )
      }
   )

   it('should say when the spider worker has not announced the task', () => {
      expect(browserTestBlocker('ACTIVE', false)).toBe('The spider worker has not announced the browser test yet.')
   })
})
