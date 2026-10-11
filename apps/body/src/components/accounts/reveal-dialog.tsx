import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'

import { trpc } from '../../trpc'

const SecretLine = ({ label, value }: { label: string; value?: string }) =>
   value ? (
      <div className="grid gap-1">
         <span className="text-muted-foreground text-xs">{label}</span>
         <code className="bg-muted max-h-40 overflow-auto rounded px-2 py-1 font-mono text-xs break-all">{value}</code>
      </div>
   ) : null

type Reveal = ReturnType<typeof trpc.linkedInAccount.reveal.useMutation>

// Open while the mutation has run; closing resets it so the secrets leave memory.
export const RevealDialog = ({ reveal }: { reveal: Reveal }) => {
   const secrets = reveal.data?.secrets

   return (
      <Dialog open={!reveal.isIdle} onOpenChange={open => (open ? undefined : reveal.reset())}>
         <DialogContent className="sm:max-w-lg">
            <DialogHeader>
               <DialogTitle>{reveal.data?.email ?? 'Credentials'}</DialogTitle>
               <DialogDescription>Visible only to you. Do not share these values.</DialogDescription>
            </DialogHeader>
            {reveal.isPending ? (
               <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Decrypting…
               </p>
            ) : null}
            {reveal.error ? <p className="text-destructive text-sm">{reveal.error.message}</p> : null}
            {secrets ? (
               <div className="grid gap-3">
                  <SecretLine label="Password" value={secrets.password} />
                  <SecretLine label="Two-step verification key" value={secrets.totpSecret} />
                  <SecretLine label="Browser sign-in token (cookies)" value={secrets.session} />
               </div>
            ) : null}
            <DialogFooter>
               <DialogClose asChild>
                  <Button variant="outline">Close</Button>
               </DialogClose>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
