import { describe, expect, it } from 'vitest'

import { createAuthConfig } from './config'

const origin = 'http://localhost:3000'

describe('createAuthConfig', () => {
   it('uses local authentik defaults when no env is set', () => {
      const config = createAuthConfig({}, origin)

      expect(config.oidc).toMatchObject({
         authority: 'http://localhost:9000/application/o/automatedlinkedin/',
         client_id: 'automatedlinkedin',
         redirect_uri: 'http://localhost:3000/callback',
         post_logout_redirect_uri: 'http://localhost:3000/',
         response_type: 'code',
         scope: 'openid profile email',
      })
      expect(config.accountUrl).toBe('http://localhost:9000/if/user/')
   })

   it('reads overrides from env and trims trailing slashes', () => {
      const config = createAuthConfig(
         {
            VITE_AUTHENTIK_URL: 'https://auth.elitale.com//',
            VITE_AUTHENTIK_CLIENT_ID: 'client-1',
            VITE_AUTHENTIK_APP_SLUG: 'app-1',
         },
         'https://app.elitale.com'
      )

      expect(config.oidc.authority).toBe('https://auth.elitale.com/application/o/app-1/')
      expect(config.oidc.client_id).toBe('client-1')
      expect(config.oidc.redirect_uri).toBe('https://app.elitale.com/callback')
      expect(config.accountUrl).toBe('https://auth.elitale.com/if/user/')
   })

   it('builds a signup url whose next is the relative authorize path', () => {
      const config = createAuthConfig({ VITE_AUTHENTIK_ENROLLMENT_SLUG: 'join' }, origin)
      const authorize = 'http://localhost:9000/application/o/authorize/?client_id=c&state=s%201'

      expect(config.signupUrl(authorize)).toBe(
         `http://localhost:9000/if/flow/join/?next=${encodeURIComponent('/application/o/authorize/?client_id=c&state=s%201')}`
      )
   })

   it('falls back to defaults for empty env values', () => {
      const config = createAuthConfig({ VITE_AUTHENTIK_URL: '', VITE_AUTHENTIK_CLIENT_ID: '' }, origin)

      expect(config.oidc.authority).toBe('http://localhost:9000/application/o/automatedlinkedin/')
      expect(config.oidc.client_id).toBe('automatedlinkedin')
   })
})
