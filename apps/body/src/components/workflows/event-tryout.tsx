import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { readableError } from '@/lib/trpc-error'
import { useState } from 'react'
import { toast } from 'sonner'

import { trpc } from '../../trpc'
import { timeOf } from './run-sentence'

// Real events of the owner next to a trigger: why one did or did not start the workflow, a preview on it, and a replay. A preview sends
// and adds nothing; a replay is a real run and is confirmed first (.plan/workflow-events-and-hooks.md).

type Pending = { id: string; label: string }

export const EventTryout = ({ workflowId }: { workflowId: string }) => {
   const utils = trpc.useUtils()
   const recent = trpc.workflow.eventsRecent.useQuery({ id: workflowId }, { refetchInterval: 15_000 })
   const [checking, setChecking] = useState<string | null>(null)
   const [replaying, setReplaying] = useState<Pending | null>(null)
   const check = trpc.workflow.eventCheck.useQuery({ id: workflowId, eventId: checking ?? '' }, { enabled: checking !== null })
   const run = trpc.workflow.eventRun.useMutation({
      onSuccess: started => {
         void utils.workflow.runs.invalidate({ workflowId })
         toast.success('Started.', {
            action: {
               label: 'Show the run',
               onClick: () => window.location.assign(`/workflows/${workflowId}?run=${started.runId}`),
            },
         })
      },
      onError: error => toast.error(readableError(error)),
   })

   return (
      <div className="grid gap-2">
         <h3 className="text-sm font-medium">Try it on a real event</h3>
         <p className="text-muted-foreground text-sm">
            Pick one of the newest events this block looks at. A preview sends nothing and adds nobody. A replay is a real run.
         </p>
         {recent.data && recent.data.length > 0 ? (
            <ul className="grid gap-2 text-sm" aria-label="Recent events to try">
               {recent.data.slice(0, 10).map(event => (
                  <li key={event.id} className="grid gap-1 border-b py-1 last:border-b-0">
                     <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-muted-foreground">{timeOf(new Date(event.at).toISOString())}</span>
                        <span>
                           {event.task} ({event.phase}), {event.account}
                        </span>
                        <span className="font-medium">
                           {event.outcome ? event.outcome.status.toLowerCase() : 'not delivered to this workflow'}
                        </span>
                     </div>
                     <div className="flex flex-wrap gap-2">
                        <Button
                           type="button"
                           size="sm"
                           variant="outline"
                           onClick={() => setChecking(checking === event.id ? null : event.id)}
                        >
                           Why, or why not
                        </Button>
                        <Button
                           type="button"
                           size="sm"
                           variant="outline"
                           disabled={run.isPending}
                           onClick={() => run.mutate({ id: workflowId, eventId: event.id, mode: 'preview' })}
                        >
                           Preview on this
                        </Button>
                        <Button
                           type="button"
                           size="sm"
                           variant="outline"
                           disabled={run.isPending}
                           onClick={() => setReplaying({ id: event.id, label: `${event.task}, ${event.account}` })}
                        >
                           Replay
                        </Button>
                     </div>
                     {checking === event.id && check.data ? (
                        <ul className="text-muted-foreground grid gap-1 text-xs" aria-label="Why or why not">
                           {check.data.map(trigger => (
                              <li key={trigger.nodeId}>
                                 {trigger.name}:{' '}
                                 {trigger.ok
                                    ? 'every filter passes, so it would start a run.'
                                    : trigger.failed
                                         .map(item => `${item.filter} needs ${item.expected} but the event has ${item.got}`)
                                         .join('; ')}
                              </li>
                           ))}
                        </ul>
                     ) : null}
                  </li>
               ))}
            </ul>
         ) : (
            <p className="text-muted-foreground text-sm">No event of this kind yet.</p>
         )}
         <AlertDialog open={replaying !== null} onOpenChange={open => (open ? undefined : setReplaying(null))}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Replay this event?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This starts a real run of the workflow for {replaying?.label}, as if the event had just happened. Blocks that act
                     for real act only if &ldquo;Act for real&rdquo; is on. The same event can be replayed once in 10 minutes.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={() =>
                        replaying ? run.mutate({ id: workflowId, eventId: replaying.id, mode: 'replay' }) : undefined
                     }
                  >
                     Replay
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   )
}
