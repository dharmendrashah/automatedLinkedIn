import { describe, expect, it } from 'vitest'

import { loginTestBlocker } from './login-test'

describe('loginTestBlocker', () => {
   it('should let an account with a working proxy be tested', () => {
      expect(loginTestBlocker('ACTIVE', true)).toBeUndefined()
      expect(loginTestBlocker('ERROR', true)).toBeUndefined()
   })

   it('should say a paused account has to be resumed first', () => {
      expect(loginTestBlocker('DISABLED', true)).toBe('Resume the account before testing it.')
   })

   it('should say a working proxy is needed, and never log in without one', () => {
      expect(loginTestBlocker('ACTIVE', false)).toBe('Add a proxy that works first: logins never go out directly.')
   })

   it('should not block while it is not known whether the account has a proxy', () => {
      expect(loginTestBlocker('PENDING', undefined)).toBeUndefined()
   })
})
