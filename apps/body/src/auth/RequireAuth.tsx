import { type ReactNode } from 'react'
import { useAuth } from 'react-oidc-context'
import { Navigate, useLocation } from 'react-router'

export const RequireAuth = ({ children }: { children: ReactNode }) => {
   const { isLoading, isAuthenticated } = useAuth()
   const { pathname, search } = useLocation()

   if (isLoading) return <p className="status">Loading…</p>
   if (!isAuthenticated) return <Navigate to="/login" replace state={{ returnTo: `${pathname}${search}` }} />

   return children
}
