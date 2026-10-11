import { FailureCard } from '@/components/failure-card'
import { PageStatus } from '@/components/page-status'
import { useAuth } from 'react-oidc-context'

export const Callback = () => {
   const { error } = useAuth()

   if (error) return <FailureCard title="Sign in failed" message={error.message} to="/login" action="Try again" />

   return <PageStatus>Signing you in…</PageStatus>
}
