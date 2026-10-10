import { UserManager } from 'oidc-client-ts'

import { authConfig } from './authConfig'

class AppUserManager extends UserManager {
   // Stores the PKCE state like signinRedirect would, but returns the URL instead of navigating.
   async createSigninUrl(state?: unknown) {
      const request = await this._client.createSigninRequest({ state, request_type: 'si:r' })

      return request.url
   }
}

export const userManager = new AppUserManager(authConfig.oidc)
