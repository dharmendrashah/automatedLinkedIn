import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'

import { trpc } from '../../trpc'
import { TakeoverPanel } from './takeover-panel'
import { useTakeoverAlert } from './use-takeover-alert'

const CHECK_MS = 3000

// Shown on every page while a worker is holding a run for its owner: a sign-in that LinkedIn stopped at a security check
// waits for up to ten minutes for the owner to finish it. Asking costs brain nothing while nothing is held. A run the owner
// has not opened yet also sets off the alert (icon, title, sound, notification), even with the tab in the background.
export const TakeoverBanner = () => {
   const waiting = trpc.takeover.list.useQuery(undefined, {
      retry: false,
      refetchInterval: CHECK_MS,
      refetchIntervalInBackground: true,
   })
   const [openId, setOpenId] = useState<string>()
   const [seen, setSeen] = useState<string[]>([])
   const first = waiting.data?.[0]
   const open = waiting.data?.find(item => item.id === openId)
   const unseen = (waiting.data ?? []).map(({ id }) => id).filter(id => !seen.includes(id))

   const show = (id: string) => {
      setOpenId(id)
      setSeen(ids => (ids.includes(id) ? ids : [...ids, id]))
   }

   useTakeoverAlert(unseen, () => {
      if (unseen[0]) {
         show(unseen[0])
      }
   })

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
               <Button size="sm" onClick={() => show(first.id)}>
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
