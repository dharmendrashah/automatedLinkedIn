import { Badge } from '@/components/ui/badge'

import { type ConfigValue } from './types'

import { trpc } from '../../trpc'
import { Code } from './api-request'
import { timeOf } from './run-sentence'

// The Input tab of the two event triggers: whether the workflow is listening, who it reacts to, what happened to the latest events, and
// what the JSON of an event looks like (.plan/workflow-events-and-hooks.md).

const STARTERS: Record<string, string> = {
   owner: 'you by hand',
   automation: 'the system',
   workflow: 'a workflow',
   retry: 'a retry',
   event: 'a workflow started by an event',
}

const PHASES: Record<string, string> = {
   before: 'before it starts',
   on: 'while it works',
   after: 'when it finishes',
}

const STATUS: Record<string, string> = {
   PENDING: 'Waiting for its turn',
   STARTED: 'Started a run',
   SKIPPED: 'Skipped',
   DROPPED: 'Dropped',
}

const startersText = (values: Record<string, ConfigValue | undefined>) => {
   const kinds = Array.isArray(values.startedBy) ? values.startedBy : Object.keys(STARTERS)

   return kinds.length === 0 || kinds.length === Object.keys(STARTERS).length
      ? 'tasks started by anyone'
      : `tasks started by ${kinds.map(kind => STARTERS[String(kind)] ?? String(kind)).join(', ')}`
}

export const EventTriggerInput = ({
   workflowId,
   type,
   values,
}: {
   workflowId: string
   type: 'trigger.taskEvent' | 'trigger.messageArrived'
   values: Record<string, ConfigValue | undefined>
}) => {
   const messages = type === 'trigger.messageArrived'
   const phase = messages ? 'after' : values.phase === 'before' || values.phase === 'on' ? values.phase : 'after'
   const task = messages ? 'linkedin-messages' : typeof values.task === 'string' ? values.task : ''
   const events = trpc.workflow.events.useQuery({ id: workflowId }, { refetchInterval: 10_000 })
   const sample = trpc.workflow.eventSample.useQuery({ task, phase })
   const day = events.data?.last24Hours ?? {}
   const total = Object.values(day).reduce((sum, count) => sum + count, 0)

   return (
      <div className="grid gap-4">
         <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
               {events.data?.listening ? <Badge>Listening</Badge> : <Badge variant="outline">Not listening</Badge>}
               <span className="text-muted-foreground text-sm">
                  {messages
                     ? 'Reacts to new messages from people, read by the accounts.'
                     : `Reacts to ${task === '' ? 'any task' : `the task ${task}`} ${PHASES[phase]}, ${startersText(values)}.`}
               </span>
            </div>
            {events.data && !events.data.listening ? (
               <p className="text-muted-foreground text-sm">
                  Switch the workflow on to start runs from events. Events while it is off are not kept for it.
               </p>
            ) : null}
            <p className="text-muted-foreground text-sm">
               {total === 0
                  ? 'No event reached it in the last 24 hours.'
                  : `Last 24 hours: ${Object.entries(day)
                       .map(([status, count]) => `${count} ${(STATUS[status] ?? status).toLowerCase()}`)
                       .join(', ')}.`}
            </p>
         </div>

         <div className="grid gap-2">
            <h3 className="text-sm font-medium">Latest events</h3>
            {events.data && events.data.recent.length > 0 ? (
               <ul className="grid gap-1 text-sm" aria-label="Latest events">
                  {events.data.recent.slice(0, 10).map(event => (
                     <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 border-b py-1 last:border-b-0">
                        <span className="text-muted-foreground">{timeOf(new Date(event.createdAt).toISOString())}</span>
                        <span>
                           {event.task} {PHASES[event.phase] ?? event.phase}, {event.account}, started by{' '}
                           {STARTERS[event.startedBy] ?? event.startedBy}
                        </span>
                        <span className="font-medium">{STATUS[event.status] ?? event.status}</span>
                        {event.reason ? <span className="text-muted-foreground">{event.reason}</span> : null}
                     </li>
                  ))}
               </ul>
            ) : (
               <p className="text-muted-foreground text-sm">Nothing yet. The next matching event will show here.</p>
            )}
         </div>

         <div className="grid gap-2">
            <h3 className="text-sm font-medium">What an event looks like</h3>
            <p className="text-muted-foreground text-sm">
               Made-up values. The people the event is about arrive as the items of this block, not in this JSON.
               &ldquo;Send via API&rdquo; posts it as <code>event</code> when an event started the run.
            </p>
            {sample.data ? <Code text={JSON.stringify(sample.data, null, 2)} label="Copy the sample event" /> : null}
         </div>
      </div>
   )
}
