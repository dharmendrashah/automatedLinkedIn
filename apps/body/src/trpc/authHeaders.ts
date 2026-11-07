type Session = { expired?: boolean; access_token: string }

type Renewer<S extends Session> = {
   getUser: () => Promise<S | null>
   signinSilent: () => Promise<S | null>
}

// An expired token is renewed once with the refresh token; when renewal fails the request goes without a header and the API answers UNAUTHORIZED.
export const authHeadersOf = async <S extends Session>(manager: Renewer<S>): Promise<Record<string, string>> => {
   const user = await manager.getUser()
   const current = user?.expired ? await manager.signinSilent().catch(() => null) : user

   return current ? { authorization: `Bearer ${current.access_token}` } : {}
}
