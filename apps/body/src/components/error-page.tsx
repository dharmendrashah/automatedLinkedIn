import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { errorDetails, isNewVersionError } from '@/lib/app-error'
import { ArrowLeft, Copy, House, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

type Props = {
   error: Error
   onRetry: () => void
   // The whole screen (nothing else of the app is left) or in place of a page or a panel.
   fullScreen?: boolean
}

const COPY_WORDS = {
   idle: 'Copy details',
   done: 'Copied',
   failed: 'Copy failed',
}

// Works without the router and the sign-in, which may be what crashed: plain history and full page loads only.
export const ErrorPage = ({ error, onRetry, fullScreen = false }: Props) => {
   const [copy, setCopy] = useState<keyof typeof COPY_WORDS>('idle')
   const newVersion = isNewVersionError(error)
   const canGoBack = window.history.length > 1

   const copyDetails = () => {
      const { pathname, search } = window.location

      navigator.clipboard
         .writeText(errorDetails(error, pathname + search, new Date()))
         .then(() => setCopy('done'))
         .catch(() => setCopy('failed'))
   }

   const goBack = () => {
      // Nothing above the full-screen page follows the address, so the previous page is loaded afresh.
      if (fullScreen) {
         window.addEventListener('popstate', () => window.location.reload(), { once: true })
      }

      window.history.back()
   }

   const reload = (
      <Button variant={newVersion ? 'default' : 'outline'} onClick={() => window.location.reload()}>
         <RefreshCw />
         Reload page
      </Button>
   )

   return (
      <div
         role="alert"
         className={cn('grid w-full place-items-center px-4', fullScreen ? 'bg-background min-h-svh' : 'py-10')}
      >
         <Card className="w-full max-w-lg">
            <CardHeader>
               <CardTitle className="flex items-center gap-2">
                  <TriangleAlert className="text-destructive size-5" aria-hidden />
                  {newVersion ? 'A new version of the app is out' : 'Something went wrong'}
               </CardTitle>
               <CardDescription>
                  {newVersion
                     ? 'This page changed since you opened the app. Reload to get the new version.'
                     : 'This part of the app stopped. Your data is safe. Try again, or reload the page if it happens again.'}
               </CardDescription>
            </CardHeader>
            <CardContent>
               <details className="text-sm">
                  <summary className="text-muted-foreground cursor-pointer">Details</summary>
                  <p className="bg-muted mt-2 rounded-md p-2 font-mono text-xs break-words">{error.message}</p>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={copyDetails}>
                     <Copy />
                     {COPY_WORDS[copy]}
                  </Button>
               </details>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
               {newVersion ? (
                  reload
               ) : (
                  <>
                     <Button onClick={onRetry}>
                        <RotateCcw />
                        Try again
                     </Button>
                     {reload}
                  </>
               )}
               {canGoBack ? (
                  <Button variant="ghost" onClick={goBack}>
                     <ArrowLeft />
                     Go back
                  </Button>
               ) : null}
               <Button variant="ghost" asChild>
                  <a href="/dashboard">
                     <House />
                     Go to dashboard
                  </a>
               </Button>
            </CardFooter>
         </Card>
      </div>
   )
}
