import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { readableError } from '@/lib/trpc-error'
import { Play } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '../../trpc'

// One action for a campaign that has not started: it switches on finding and connecting. Nothing is sent until the owner ticks the
// box (.plan/007-start-finding-and-connecting-in-one-action.md).
export const StartCampaign = ({ id, onStarted }: { id: string; onStarted: () => void }) => {
   const [open, setOpen] = useState(false)
   const [sendInvites, setSendInvites] = useState(false)
   const start = trpc.campaign.start.useMutation({
      onSuccess: (_started, variables) => {
         setOpen(false)
         toast.success(
            variables.sendInvites
               ? 'Started. Connection requests will go out within your limits.'
               : 'Started. Nothing is sent until you arm the invites on the Workflows tab.'
         )
         onStarted()
      },
      onError: error => toast.error(readableError(error)),
   })
   const close = (next: boolean) => {
      setOpen(next)

      if (!next) {
         setSendInvites(false)
         start.reset()
      }
   }

   return (
      <>
         <Button onClick={() => setOpen(true)}>
            <Play aria-hidden />
            Start finding and connecting
         </Button>
         <Dialog open={open} onOpenChange={close}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Start finding and connecting?</DialogTitle>
                  <DialogDescription>
                     Find leads and Connect will run every day. Nothing is sent until you tick the box below.
                  </DialogDescription>
               </DialogHeader>
               <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                     <Checkbox
                        id="send-invites"
                        checked={sendInvites}
                        onCheckedChange={next => setSendInvites(next === true)}
                     />
                     <Label htmlFor="send-invites">Send connection requests for real</Label>
                  </div>
                  <p className="text-muted-foreground text-xs">
                     Your accounts&apos; daily and weekly limits still apply. Run a preview first from the Workflows tab
                     if you want to see what it would do.
                  </p>
               </div>
               <DialogFooter>
                  <Button variant="outline" onClick={() => close(false)}>
                     Cancel
                  </Button>
                  <Button disabled={start.isPending} onClick={() => start.mutate({ id, sendInvites })}>
                     Start
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </>
   )
}
