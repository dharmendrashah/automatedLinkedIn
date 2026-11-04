import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { trpc } from '../../trpc'
import { ToneBadge } from './tone-badge'

// The one switch that stops every reaction and comment the platform makes, at the next pick-up (.plan/lead-pipeline-p3-engage.md, P8).
export const ActsSwitch = () => {
   const utils = trpc.useUtils()
   const acts = trpc.jobs.acts.useQuery(undefined, { retry: false })
   const change = trpc.jobs.setActs.useMutation({ onSuccess: () => utils.jobs.acts.invalidate() })

   if (acts.isPending) {
      return <Skeleton className="h-16 w-full rounded-xl" />
   }

   if (!acts.data) {
      return <p className="text-destructive text-sm">{acts.error?.message}</p>
   }

   const { on, changedBy, changedAt } = acts.data

   return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
         <div className="grid gap-1">
            <div className="flex items-center gap-2 text-sm font-medium">
               Reactions and comments
               <ToneBadge tone={on ? 'success' : 'warning'}>{on ? 'On' : 'Paused'}</ToneBadge>
            </div>
            <p className="text-muted-foreground text-xs">
               {on
                  ? 'Accounts react to and comment on posts inside their limits.'
                  : 'Nothing is planned or sent. What is waiting stays queued.'}
               {changedBy && changedAt ? ` Last changed by ${changedBy} on ${new Date(changedAt).toLocaleString()}.` : ''}
            </p>
         </div>
         <Button
            variant={on ? 'outline' : 'default'}
            size="sm"
            disabled={change.isPending}
            onClick={() => change.mutate({ on: !on })}
         >
            {on ? 'Pause all' : 'Resume'}
         </Button>
         {change.error ? <p className="text-destructive w-full text-sm">{change.error.message}</p> : null}
      </div>
   )
}
