import { type UserManagerSettings } from 'oidc-client-ts'

export type AuthEnv = Record<string, string | undefined>

export type AuthConfig = {
   oidc: UserManagerSettings
   signupUrl: (authorizeUrl: string) => string
   accountUrl: string
}

export const createAuthConfig = (env: AuthEnv, origin: string): AuthConfig => {
   const authentikUrl = (env.VITE_AUTHENTIK_URL || 'http://localhost:9000').replace(/\/+$/, '')
   const clientId = env.VITE_AUTHENTIK_CLIENT_ID || 'automatedlinkedin'
   const appSlug = env.VITE_AUTHENTIK_APP_SLUG || 'automatedlinkedin'
   const enrollmentSlug = env.VITE_AUTHENTIK_ENROLLMENT_SLUG || 'automatedlinkedin-enrollment'

   return {
      oidc: {
         authority: `${authentikUrl}/application/o/${appSlug}/`,
         client_id: clientId,
         redirect_uri: `${origin}/callback`,
         post_logout_redirect_uri: `${origin}/`,
         response_type: 'code',
         scope: 'openid profile email',
      },
      // authentik only accepts a relative `next`, so resume the OIDC request by its path and query.
      signupUrl: authorizeUrl => {
         const { pathname, search } = new URL(authorizeUrl)

         return `${authentikUrl}/if/flow/${enrollmentSlug}/?next=${encodeURIComponent(`${pathname}${search}`)}`
      },
      accountUrl: `${authentikUrl}/if/user/`,
   }
}
