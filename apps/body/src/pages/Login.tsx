import { useEffect, useRef, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import { Link, Navigate, useLocation } from 'react-router'

import { returnToOf } from '../auth/returnTo'

export const Login = () => {
   const auth = useAuth()
   const { state } = useLocation()
   const started = useRef(false)
   const [failure, setFailure] = useState<string>()
   const { isLoading, isAuthenticated, activeNavigator, signinRedirect } = auth

   useEffect(() => {
      if (isLoading || isAuthenticated || activeNavigator || started.current) return
      started.current = true
      signinRedirect({ state: { returnTo: returnToOf(state) } }).catch((error: unknown) =>
         setFailure(error instanceof Error ? error.message : 'Could not reach the sign-in service.')
      )
   }, [isLoading, isAuthenticated, activeNavigator, signinRedirect, state])

   if (isAuthenticated) return <Navigate to={returnToOf(state)} replace />

   const message = failure ?? auth.error?.message

   if (message) {
      return (
         <section className="card">
            <h1>Sign in failed</h1>
            <p className="error">{message}</p>
            <Link to="/">Back to home</Link>
         </section>
      )
   }

   return <p className="status">Redirecting to sign in…</p>
}
