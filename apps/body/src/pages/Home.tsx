import { PageStatus } from '@/components/page-status'
import { Button } from '@/components/ui/button'
import { useAuth } from 'react-oidc-context'
import { Link, Navigate } from 'react-router'

export const Home = () => {
   const { isLoading, isAuthenticated } = useAuth()

   if (isLoading) return <PageStatus>Loading…</PageStatus>
   if (isAuthenticated) return <Navigate to="/dashboard" replace />

   return (
      <section className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 text-center">
         <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Automate your LinkedIn outreach</h1>
         <p className="text-muted-foreground text-lg">Sign in or create an account to get started.</p>
         <div className="flex gap-3">
            <Button asChild size="lg">
               <Link to="/signup">Sign up</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
               <Link to="/login">Log in</Link>
            </Button>
         </div>
      </section>
   )
}
