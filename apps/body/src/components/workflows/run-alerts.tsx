import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TriangleAlert, X } from 'lucide-react'
import { Link } from 'react-router'

import { trpc } from '../../trpc'

const POLL_MS = 30_000

// Shown only while a run of the owner failed lately and was not dismissed: the workflow, what the run says, and a way to
// open it or dismiss it (.plan/workflow-engine-p4-lifecycle.md).
export const RunAlerts = () => {
   const utils = trpc.useUtils()
   const alerts = trpc.workflow.alerts.useQuery(undefined, {
      refetchInterval: POLL_MS,
      retry: false,
   })
   const dismiss = trpc.workflow.dismissAlert.useMutation({
      onSuccess: () => utils.workflow.alerts.invalidate(),
   })
   const list = alerts.data ?? []

   if (list.length === 0) {
      return null
   }

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button
               variant="ghost"
               size="sm"
               className="text-destructive gap-1"
               aria-label={list.length === 1 ? '1 workflow run failed' : `${list.length} workflow runs failed`}
            >
               <TriangleAlert />
               {list.length}
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="grid w-96 gap-2">
            <p className="text-sm font-medium">Runs that failed in the last 7 days</p>
            <ul className="grid gap-2">
               {list.map(alert => (
                  <li key={alert.runId} className="flex items-start justify-between gap-2 text-sm">
                     <div className="min-w-0">
                        <Link
                           to={`/workflows/${alert.workflowId}`}
                           className="font-medium underline-offset-4 hover:underline"
                        >
                           {alert.workflowName}
                        </Link>
                        <p className="text-muted-foreground line-clamp-2 text-xs">
                           {alert.message ?? 'Something went wrong.'}
                        </p>
                     </div>
                     <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Dismiss the alert about ${alert.workflowName}`}
                        disabled={dismiss.isPending}
                        onClick={() => dismiss.mutate({ runId: alert.runId })}
                     >
                        <X />
                     </Button>
                  </li>
               ))}
            </ul>
         </PopoverContent>
      </Popover>
   )
}
