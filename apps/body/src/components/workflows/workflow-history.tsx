import { Button } from '@/components/ui/button'
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog'
import { readableError } from '@/lib/trpc-error'
import { History } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '../../trpc'

// The saved versions of a workflow, newest first, and a way to put one back. A restore is a normal save: it makes a new
// version, so it can be undone by restoring the one before (.plan/workflow-engine-p5-editor.md).
export const WorkflowHistory = ({ workflowId, onRestored }: { workflowId: string; onRestored: () => void }) => {
   const [open, setOpen] = useState(false)
   const utils = trpc.useUtils()
   const history = trpc.workflow.history.useQuery({ id: workflowId }, { enabled: open })
   const restore = trpc.workflow.restore.useMutation({
      onSuccess: () => {
         void utils.workflow.get.invalidate({ id: workflowId })
         void utils.workflow.history.invalidate({ id: workflowId })
         void utils.workflow.list.invalidate()
         setOpen(false)
         onRestored()
         toast.success('The version was restored.')
      },
      onError: error => {
         toast.error(readableError(error))
      },
   })

   return (
      <>
         <Button variant="outline" onClick={() => setOpen(true)}>
            <History />
            History
         </Button>
         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Saved versions</DialogTitle>
                  <DialogDescription>
                     Every save that changed the blocks is kept, up to the last 50. Restoring one replaces what is on the
                     canvas, including changes you have not saved.
                  </DialogDescription>
               </DialogHeader>
               {history.isPending ? <p className="text-muted-foreground text-sm">Loading…</p> : null}
               {history.error ? <p className="text-destructive text-sm">{readableError(history.error)}</p> : null}
               <ul className="grid max-h-80 gap-2 overflow-y-auto">
                  {history.data?.map((version, index) => (
                     <li key={version.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                           {new Date(version.createdAt).toLocaleString()}
                           <span className="text-muted-foreground">
                              {' · '}
                              {version.blocks === 1 ? '1 block' : `${version.blocks} blocks`}
                              {index === 0 ? ' · latest' : ''}
                           </span>
                        </span>
                        {index === 0 ? null : (
                           <Button
                              variant="outline"
                              size="sm"
                              disabled={restore.isPending}
                              onClick={() => restore.mutate({ id: workflowId, versionId: version.id })}
                           >
                              Restore
                           </Button>
                        )}
                     </li>
                  ))}
               </ul>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                     Close
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </>
   )
}
