import { Button } from '@/components/ui/button'
import { readableError } from '@/lib/trpc-error'
import { STAGE_LABELS } from '@automatedLinkedIn/contracts'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { trpc } from '../../trpc'

type Item = {
   id: string
   name: string
   stage: keyof typeof STAGE_LABELS
   enabled: boolean
}

// Going live, one stage at a time (.plan/lead-pipeline-p6-campaign-starter.md): preview a stage, switch it on, in the order a person
// moves through them. "Act for real" is switched on on the canvas of each act block, after its preview.
export const GoLive = ({ workflows, onChanged }: { workflows: Item[]; onChanged: () => void }) => {
   const start = trpc.workflow.start.useMutation({
      onSuccess: () => toast.success('The preview started. Open the workflow to read what it would do.'),
      onError: error => toast.error(readableError(error)),
   })
   const update = trpc.workflow.update.useMutation({
      onSuccess: onChanged,
      onError: error => toast.error(readableError(error)),
   })

   if (workflows.length === 0) {
      return null
   }

   return (
      <section className="grid gap-2 rounded-xl border px-4 py-3">
         <h3 className="text-sm font-medium">Go live</h3>
         <ol className="grid gap-2 text-sm">
            {workflows.map((workflow, at) => (
               <li key={workflow.id} className="flex flex-wrap items-center gap-2">
                  <span className="w-48">{`${at + 1} ${STAGE_LABELS[workflow.stage]}`}</span>
                  <span className="text-muted-foreground w-12">{workflow.enabled ? 'On' : 'Off'}</span>
                  <Button
                     size="sm"
                     variant="outline"
                     disabled={start.isPending}
                     onClick={() => start.mutate({ id: workflow.id, preview: true })}
                  >
                     Preview
                  </Button>
                  <Button
                     size="sm"
                     variant={workflow.enabled ? 'outline' : 'default'}
                     disabled={update.isPending}
                     onClick={() => update.mutate({ id: workflow.id, enabled: !workflow.enabled })}
                  >
                     {workflow.enabled ? 'Switch off' : 'Switch on'}
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                     <Link to={`/workflows/${workflow.id}`}>Open</Link>
                  </Button>
               </li>
            ))}
         </ol>
         <p className="text-muted-foreground text-xs">
            Switch on Discover first: it only reads. Act for real is off in every block until you switch it on, one stage at a
            time, on the canvas.
         </p>
      </section>
   )
}
