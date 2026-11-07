import { describe, expect, it, vi } from 'vitest'

import { authHeadersOf } from './authHeaders'

const session = (access_token: string, expired = false) => ({ access_token, expired })

describe('authHeadersOf', () => {
   it('sends the stored token when it is still valid', async () => {
      const signinSilent = vi.fn()

      await expect(authHeadersOf({ getUser: async () => session('a'), signinSilent })).resolves.toEqual({
         authorization: 'Bearer a',
      })
      expect(signinSilent).not.toHaveBeenCalled()
   })

   it('renews an expired token and sends the new one', async () => {
      await expect(
         authHeadersOf({
            getUser: async () => session('old', true),
            signinSilent: async () => session('new'),
         })
      ).resolves.toEqual({ authorization: 'Bearer new' })
   })

   it('sends no header when renewal fails', async () => {
      await expect(
         authHeadersOf({
            getUser: async () => session('old', true),
            signinSilent: async () => Promise.reject(new Error('login required')),
         })
      ).resolves.toEqual({})
   })

   it('sends no header when nobody is signed in and does not try to renew', async () => {
      const signinSilent = vi.fn()

      await expect(authHeadersOf({ getUser: async () => null, signinSilent })).resolves.toEqual({})
      expect(signinSilent).not.toHaveBeenCalled()
   })
})
