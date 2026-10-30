import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Loader2 } from 'lucide-react'

import { formatUsd } from './types'

import { trpc } from '../../trpc'

type Props = {
   workflowId: string
   // null when closed.
   mode: 'preview' | 'run' | null
   onClose: () => void
   onStarted: (runId: string) => void
}

// Shows what a run can cost at most and starts it only after the client confirms.
export const RunDialog = ({ workflowId, mode, onClose, onStarted }: Props) => {
   const preview = mode === 'preview'
   const estimate = trpc.workflow.estimate.useQuery(
      {
         id: workflowId,
         preview,
      },
      { enabled: mode !== null }
   )
   const start = trpc.workflow.start.useMutation({
      onSuccess: run => {
         onStarted(run.id)
         onClose()
      },
   })
   // Notes only explain; an error is the one thing that stops a run.
   const firstError = estimate.data?.problems.find(({ level }) => level === 'error')

   return (
      <Dialog
         open={mode !== null}
         onOpenChange={open => {
            if (!open) {
               start.reset()
               onClose()
            }
         }}
      >
         <DialogContent>
            <DialogHeader>
               <DialogTitle>{preview ? 'Run a preview' : 'Run this workflow'}</DialogTitle>
               <DialogDescription>
                  {preview
                     ? 'A preview runs on one post and at most 20 people per block. It is charged, adds nobody to your list and leaves your posts as they are.'
                     : 'The workflow runs on the posts waiting in your posts list and adds the people it keeps to its list.'}
               </DialogDescription>
            </DialogHeader>
            {estimate.data ? (
               <p className="text-sm">
                  Data cost up to <span className="font-medium">{formatUsd(estimate.data.totalMicros)}</span>. You pay
                  only for what is found, usually less.
               </p>
            ) : (
               <Loader2 className="animate-spin" />
            )}
            {firstError ? (
               <Alert variant="destructive">
                  <AlertDescription>{firstError.message}</AlertDescription>
               </Alert>
            ) : null}
            {start.error ? (
               <Alert variant="destructive">
                  <AlertDescription>{readableError(start.error)}</AlertDescription>
               </Alert>
            ) : null}
            <DialogFooter>
               <Button variant="outline" onClick={onClose}>
                  Cancel
               </Button>
               <Button
                  disabled={!estimate.data || Boolean(firstError) || start.isPending}
                  onClick={() =>
                     start.mutate({
                        id: workflowId,
                        preview,
                     })
                  }
               >
                  {start.isPending ? <Loader2 className="animate-spin" /> : null}
                  {preview ? 'Run the preview' : 'Run it'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   )
}
