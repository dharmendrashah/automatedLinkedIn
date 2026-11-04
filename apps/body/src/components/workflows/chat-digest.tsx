import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { useState } from 'react'

import { readableError } from '@/lib/trpc-error'

import { trpc } from '../../trpc'

// The newest stored messages of the chat with one person, read when the owner asks, cut and cleaned by brain and never kept.
const Digest = ({ runId, nodeId, slug }: { runId: string; nodeId: string; slug: string }) => {
   const digest = trpc.workflow.chatDigest.useQuery({ runId, nodeId, slug }, { retry: false, staleTime: 0, gcTime: 0 })

   if (digest.isPending) {
      return <p className="text-muted-foreground text-sm">Loading</p>
   }

   if (digest.error) {
      return <p className="text-destructive text-sm">{readableError(digest.error)}</p>
   }

   return digest.data.length === 0 ? (
      <p className="text-muted-foreground text-sm">No stored messages.</p>
   ) : (
      <ul className="grid gap-2 text-sm">
         {digest.data.map((line, index) => (
            <li key={index} className="grid gap-0.5">
               <span className="text-muted-foreground text-xs">
                  {line.from === 'ME' ? 'You' : 'They'} · {line.when}
               </span>
               {line.text}
            </li>
         ))}
      </ul>
   )
}

export const ChatDigestButton = ({ runId, nodeId, slug, name }: { runId: string; nodeId: string; slug: string; name: string }) => {
   const [open, setOpen] = useState(false)

   return (
      <>
         <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            Show digest
         </Button>
         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>{name}</DialogTitle>
                  <DialogDescription>
                     The newest stored messages, cut to 200 characters. Read now for you and not kept in the run.
                  </DialogDescription>
               </DialogHeader>
               {open ? <Digest runId={runId} nodeId={nodeId} slug={slug} /> : null}
            </DialogContent>
         </Dialog>
      </>
   )
}
