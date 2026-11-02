import { Button } from '@/components/ui/button'
import { readableError } from '@/lib/trpc-error'
import { Loader2, Webhook } from 'lucide-react'
import { toast } from 'sonner'

import { type Block } from './types'

import { trpc } from '../../trpc'

// "Create an API workflow for this block": a new workflow of the API trigger, this block and Give back, so a call can run the block
// by itself. It opens in a new tab on its API tab, so what is unsaved here is kept.
export const ApiWorkflowButton = ({ type }: { type: Block['type'] }) => {
   const utils = trpc.useUtils()
   const create = trpc.workflow.createForBlock.useMutation({
      onSuccess: ({ id }) => {
         void utils.workflow.list.invalidate()
         toast.success('The API workflow is ready.', {
            duration: 15_000,
            action: {
               label: 'Open it',
               onClick: () => window.open(`/workflows/${id}?tab=api`, '_blank', 'noopener'),
            },
         })
      },
      onError: error => {
         toast.error(readableError(error))
      },
   })

   return (
      <div className="grid gap-1">
         <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={create.isPending}
            onClick={() => create.mutate({ type })}
         >
            {create.isPending ? <Loader2 className="animate-spin" /> : <Webhook />}
            Create an API workflow for this block
         </Button>
         <p className="text-muted-foreground text-xs">
            A workflow that runs this block when your API is called, with the sample call on its API tab.
         </p>
      </div>
   )
}
