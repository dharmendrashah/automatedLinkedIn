import { describe, expect, it } from 'vitest'

import { STEP_ERROR_CODES, adviceFor, isStepErrorCode, stepErrorCatalog } from './stepErrors'

describe('step errors', () => {
   it('should explain every code with a title, a reason and a fix', () => {
      for (const advice of stepErrorCatalog()) {
         expect(advice.title.length).toBeGreaterThan(5)
         expect(advice.why.length).toBeGreaterThan(0)
         expect(advice.fixes.length).toBeGreaterThan(0)
      }

      expect(stepErrorCatalog().map(({ code }) => code)).toEqual([...STEP_ERROR_CODES])
   })

   it('should never name the data supplier or show raw error text', () => {
      expect(JSON.stringify(stepErrorCatalog()).toLowerCase()).not.toMatch(/mindcase|apify|bearer|stack|exception/)
   })

   it('should fall back to the unknown advice for a step with no code or an old code', () => {
      expect(adviceFor(null).code).toBe('UNKNOWN')
      expect(adviceFor(undefined).code).toBe('UNKNOWN')
      expect(adviceFor('SOMETHING_OLD').code).toBe('UNKNOWN')
      expect(adviceFor('ICP_DELETED').code).toBe('ICP_DELETED')
      expect(isStepErrorCode('WALLET_LOW')).toBe(true)
      expect(isStepErrorCode('nope')).toBe(false)
   })

   it('should offer a button only where a fix is one click away', () => {
      const actions = stepErrorCatalog().flatMap(({ fixes }) => fixes.map(({ action }) => action))

      expect(actions.every(action => action === undefined || ['settings', 'accounts', 'icps'].includes(action))).toBe(
         true
      )
   })
})
