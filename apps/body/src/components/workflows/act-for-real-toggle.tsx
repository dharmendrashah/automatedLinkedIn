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
import { useState } from 'react'
import { toast } from 'sonner'

import { readableError } from '@/lib/trpc-error'

import { trpc } from '../../trpc'

// The "Act for real" box. The first time an owner switches it on anywhere, a notice comes first; accepting it is kept once.
export const ActForRealToggle = ({
   id,
   checked,
   onChange,
}: {
   id: string
   checked: boolean
   onChange: (next: boolean) => void
}) => {
   const me = trpc.me.useQuery(undefined, { retry: false })
   const utils = trpc.useUtils()
   const [asking, setAsking] = useState(false)
   const accept = trpc.acceptRisk.useMutation({
      onSuccess: async () => {
         await utils.me.invalidate()
         setAsking(false)
         onChange(true)
      },
      onError: error => toast.error(readableError(error)),
   })

   return (
      <>
         <Checkbox
            id={id}
            checked={checked}
            onCheckedChange={next => {
               if (next === true && !me.data?.user?.riskAcceptedAt) {
                  setAsking(true)

                  return
               }

               onChange(next === true)
            }}
         />
         <Dialog open={asking} onOpenChange={setAsking}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Before this acts on LinkedIn</DialogTitle>
                  <DialogDescription>
                     LinkedIn&apos;s rules do not allow automation, so using it is your choice and your risk. It starts
                     slowly and never goes past the limits of each account&apos;s day. You see this once.
                  </DialogDescription>
               </DialogHeader>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setAsking(false)}>
                     Not now
                  </Button>
                  <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
                     I understand, switch it on
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </>
   )
}
