import { ErrorBoundary } from '@/components/error-boundary'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-react'
import { useAuth } from 'react-oidc-context'
import { Link, Outlet, useLocation } from 'react-router'

export const PublicLayout = () => {
   const { isLoading, isAuthenticated } = useAuth()
   const { key } = useLocation()

   return (
      <div className="flex min-h-svh flex-col">
         <header className="border-b">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
               <Link to="/" className="flex items-center gap-2 font-semibold">
                  <Send className="text-primary size-5" />
                  automatedLinkedIn
               </Link>
               {isLoading ? null : isAuthenticated ? (
                  <Button asChild size="sm">
                     <Link to="/dashboard">Dashboard</Link>
                  </Button>
               ) : (
                  <nav className="flex items-center gap-2">
                     <Button asChild variant="ghost" size="sm">
                        <Link to="/login">Log in</Link>
                     </Button>
                     <Button asChild size="sm">
                        <Link to="/signup">Sign up</Link>
                     </Button>
                  </nav>
               )}
            </div>
         </header>
         <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-12">
            <ErrorBoundary where="page" resetKey={key}>
               <Outlet />
            </ErrorBoundary>
         </main>
      </div>
   )
}
