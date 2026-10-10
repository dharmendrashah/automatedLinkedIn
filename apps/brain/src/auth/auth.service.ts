import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'

import { AUTHENTIK_CLIENT_ID, AUTHENTIK_INTERNAL_URL, AUTHENTIK_ISSUER } from 'env'

export type AuthenticatedRequest = {
   token: string
   sub: string
}

export type Identity = {
   id: string
   name: string | undefined
   username: string | undefined
   email: string | undefined
   emailVerified: boolean
   groups: string[]
}

const userInfoSchema = z.object({
   sub: z.string().min(1),
   name: z.string().optional(),
   preferred_username: z.string().optional(),
   email: z.string().optional(),
   email_verified: z.boolean().optional(),
   groups: z.array(z.string()).catch([]),
})

const USERINFO_TIMEOUT_MS = 5000

export class AuthService {
   private static readonly keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

   public static bearerToken(header: string | undefined) {
      const [scheme, token, ...rest] = header?.split(' ') ?? []

      return scheme?.toLowerCase() === 'bearer' && token && rest.length === 0 ? token : undefined
   }

   public static async authenticate(token: string): Promise<AuthenticatedRequest | null> {
      try {
         const { payload } = await jwtVerify(token, this.keySet(), {
            issuer: AUTHENTIK_ISSUER,
            audience: AUTHENTIK_CLIENT_ID,
            algorithms: ['RS256'],
         })

         return payload.sub
            ? {
                 token,
                 sub: payload.sub,
              }
            : null
      } catch {
         return null
      }
   }

   public static async fetchIdentity({ token, sub }: AuthenticatedRequest): Promise<Identity> {
      const response = await fetch(`${this.baseUrl()}/application/o/userinfo/`, {
         headers: { authorization: `Bearer ${token}` },
         signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS),
      })

      if (!response.ok) {
         throw new Error(`userinfo request failed with status ${response.status}`)
      }

      const info = userInfoSchema.parse(await response.json())

      if (info.sub !== sub) {
         throw new Error('userinfo subject does not match the token')
      }

      return {
         id: info.sub,
         name: info.name,
         username: info.preferred_username,
         email: info.email,
         emailVerified: info.email_verified === true,
         groups: info.groups,
      }
   }

   // Tokens carry the browser-facing issuer, but brain may reach authentik on another host (for example in Docker).
   private static baseUrl() {
      return AUTHENTIK_INTERNAL_URL.replace(/\/+$/, '') || new URL(AUTHENTIK_ISSUER).origin
   }

   private static keySet() {
      const issuerPath = new URL(AUTHENTIK_ISSUER).pathname.replace(/\/?$/, '/')

      const url = `${this.baseUrl()}${issuerPath}jwks/`

      let keySet = this.keySets.get(url)

      if (!keySet) {
         keySet = createRemoteJWKSet(new URL(url))

         this.keySets.set(url, keySet)
      }

      return keySet
   }
}
