import { type ReactNode } from 'react'
import { AuthProvider } from 'react-oidc-context'
import { useNavigate } from 'react-router'

import { returnToOf } from './returnTo'
import { userManager } from './userManager'

export const OidcProvider = ({ children }: { children: ReactNode }) => {
   const navigate = useNavigate()

   return (
      <AuthProvider
         userManager={userManager}
         onSigninCallback={user => navigate(returnToOf(user?.state), { replace: true })}
      >
         {children}
      </AuthProvider>
   )
}
