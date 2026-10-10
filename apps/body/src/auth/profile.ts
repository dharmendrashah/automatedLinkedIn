export type Profile = {
   id: string
   displayName: string
   username: string | undefined
   email: string | undefined
   emailVerified: boolean
   groups: string[]
}

type Claims = { sub: string; [claim: string]: unknown }

const asString = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

export const toProfile = (claims: Claims): Profile => {
   const username = asString(claims.preferred_username)
   const email = asString(claims.email)

   return {
      id: claims.sub,
      displayName: asString(claims.name) ?? username ?? email ?? claims.sub,
      username,
      email,
      emailVerified: claims.email_verified === true,
      groups: Array.isArray(claims.groups) ? claims.groups.filter((g): g is string => typeof g === 'string') : [],
   }
}
