import { describe, expect, it } from 'vitest'

import { pauseTargets, resultText } from './bulk'

describe('resultText', () => {
   it('should say what changed and name every account that was skipped, with the reason', () => {
      expect(resultText(2, [])).toBe('2 changed.')
      expect(resultText(0, [])).toBe('Nothing changed.')
      expect(
         resultText(2, [
            { email: 'a@x.com', reason: 'already paused' },
            { email: 'b@x.com', reason: 'could not be reached' },
         ])
      ).toBe('2 changed, 2 skipped: a@x.com (already paused); b@x.com (could not be reached).')
      expect(resultText(0, [{ email: 'a@x.com', reason: 'already paused' }])).toBe(
         'Nothing changed, 1 skipped: a@x.com (already paused).'
      )
   })
})

describe('pauseTargets', () => {
   const accounts = [
      { email: 'a@x.com', status: 'ACTIVE' as const },
      { email: 'b@x.com', status: 'DISABLED' as const },
      { email: 'c@x.com', status: 'ERROR' as const },
   ]

   it('should pause the accounts that run and skip the ones already paused', () => {
      const { change, skipped } = pauseTargets(accounts, true)

      expect(change.map(({ email }) => email)).toEqual(['a@x.com', 'c@x.com'])
      expect(skipped).toEqual([{ email: 'b@x.com', reason: 'already paused' }])
   })

   it('should resume only the paused ones', () => {
      const { change, skipped } = pauseTargets(accounts, false)

      expect(change.map(({ email }) => email)).toEqual(['b@x.com'])
      expect(skipped.map(({ reason }) => reason)).toEqual(['not paused', 'not paused'])
   })
})
