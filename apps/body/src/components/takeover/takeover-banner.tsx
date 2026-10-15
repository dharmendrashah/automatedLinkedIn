import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'

import { trpc } from '../../trpc'
import { TakeoverPanel } from './takeover-panel'

const CHECK_MS = 3000

// Shown on every page while a worker is holding a run for its owner: a sign-in that LinkedIn stopped at a security check
// waits for up to ten minutes for the owner to finish it. Asking costs brain nothing while nothing is held.
export const TakeoverBanner = () => {
   const waiting = trpc.takeover.list.useQuery(undefined, {
      retry: false,
      refetchInterval: CHECK_MS,
   })
   const [openId, setOpenId] = useState<string>()
   const first = waiting.data?.[0]
   const open = waiting.data?.find(item => item.id === openId)

   if (!first) {
      return null
   }

   return (
      <div className="px-4 lg:px-6">
         <Alert>
            <ShieldAlert />
            <AlertTitle>LinkedIn needs you</AlertTitle>
            <AlertDescription>
               <p>
                  The sign-in for {first.accountEmail} stopped at a security check. The browser is waiting for you to
                  complete it.
               </p>
               <Button size="sm" onClick={() => setOpenId(first.id)}>
                  Take over
               </Button>
            </AlertDescription>
         </Alert>

         <Dialog open={Boolean(open)} onOpenChange={next => !next && setOpenId(undefined)}>
            <DialogContent className="sm:max-w-5xl">
               <DialogHeader>
                  <DialogTitle>Complete the security check</DialogTitle>
                  <DialogDescription>You are controlling the browser of the sign-in check.</DialogDescription>
               </DialogHeader>
               {open && (
                  <TakeoverPanel
                     key={open.id}
                     id={open.id}
                     accountEmail={open.accountEmail}
                     onClose={() => setOpenId(undefined)}
                  />
               )}
            </DialogContent>
         </Dialog>
      </div>
   )
}
