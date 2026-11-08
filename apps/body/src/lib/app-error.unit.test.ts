import { logToConsole } from '@automatedLinkedIn/logger/browser'
import { describe, expect, it, vi } from 'vitest'

import { errorDetails, isNewVersionError, reportError } from './app-error'

vi.mock('@automatedLinkedIn/logger/browser', () => ({ logToConsole: vi.fn() }))

describe('isNewVersionError', () => {
   it.each([
      'Failed to fetch dynamically imported module: https://app/assets/Network-abc.js',
      'error loading dynamically imported module: https://app/assets/Network-abc.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/index-abc.css',
   ])('knows a missing chunk after a deploy: %s', message => {
      expect(isNewVersionError(new TypeError(message))).toBe(true)
   })

   it('leaves other errors alone', () => {
      expect(isNewVersionError(new TypeError('l is not a function'))).toBe(false)
      expect(isNewVersionError('Failed to fetch dynamically imported module')).toBe(false)
   })
})

describe('errorDetails', () => {
   it('names the error, the page and the time', () => {
      const at = new Date('2026-10-30T10:00:00Z')

      expect(errorDetails(new TypeError('l is not a function'), '/network?tab=everyone', at)).toBe(
         'TypeError: l is not a function\nPage: /network?tab=everyone\nTime: 2026-10-30T10:00:00.000Z'
      )
   })
})

describe('reportError', () => {
   it('logs the error as BODY_ERROR with the place it was caught', () => {
      const error = new TypeError('l is not a function')

      reportError(error, { where: 'network page', componentStack: '\n    at Network' })

      expect(logToConsole).toHaveBeenCalledWith('body', 'error', 'Unhandled error in network page', {
         code: 'BODY_ERROR',
         where: 'network page',
         error,
         componentStack: '\n    at Network',
      })
   })
})
