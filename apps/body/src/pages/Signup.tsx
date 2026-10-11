import { FailureCard } from '@/components/failure-card'
import { PageStatus } from '@/components/page-status'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import { Navigate } from 'react-router'

import { authConfig } from '../auth/authConfig'
import { userManager } from '../auth/userManager'

export const Signup = () => {
   const { isLoading, isAuthenticated } = useAuth()
   const started = useRef(false)
   const [failure, setFailure] = useState<string>()

   useEffect(() => {
      if (isLoading || isAuthenticated || started.current) return
      started.current = true
      userManager
         .createSigninUrl({ returnTo: '/' })
         .then(url => window.location.assign(authConfig.signupUrl(url)))
         .catch((error: unknown) => setFailure(error instanceof Error ? error.message : 'Could not start sign up.'))
   }, [isLoading, isAuthenticated])

   if (isAuthenticated) return <Navigate to="/" replace />

   if (failure) return <FailureCard title="Sign up failed" message={failure} to="/" action="Back to home" />

   return <PageStatus>Redirecting to sign up…</PageStatus>
}
