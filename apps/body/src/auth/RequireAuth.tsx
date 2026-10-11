import { PageStatus } from '@/components/page-status'
import { type ReactNode } from 'react'
import { useAuth } from 'react-oidc-context'
import { Navigate, useLocation } from 'react-router'

export const RequireAuth = ({ children }: { children: ReactNode }) => {
   const { isLoading, isAuthenticated } = useAuth()
   const { pathname, search } = useLocation()

   if (isLoading) return <PageStatus>Loading…</PageStatus>
   if (!isAuthenticated) return <Navigate to="/login" replace state={{ returnTo: `${pathname}${search}` }} />

   return children
}
