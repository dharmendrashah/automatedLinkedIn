import { type RouterOutputs } from '../../trpc'

export type Workflow = RouterOutputs['workflow']['get']
export type WorkflowSummary = RouterOutputs['workflow']['list'][number]
export type Block = RouterOutputs['workflow']['catalog'][number]
export type Field = Block['fields'][number]
export type Graph = Workflow['graph']
export type GraphNode = Graph['nodes'][number]
export type ConfigValue = GraphNode['config'][string]
export type Run = RouterOutputs['workflow']['runs'][number]
export type RunDetail = RouterOutputs['workflow']['runDetail']
export type StepRun = RunDetail['steps'][number]

const money = new Intl.NumberFormat('en-US', {
   style: 'currency',
   currency: 'USD',
   minimumFractionDigits: 2,
   maximumFractionDigits: 3,
})

// Amounts travel as millionths of a dollar.
export const formatUsd = (micros: number) => money.format(micros / 1_000_000)

export const runStatuses: Record<Run['status'], { label: string; className: string }> = {
   RUNNING: {
      label: 'Running',
      className: 'bg-warning/10 text-warning',
   },
   SUCCEEDED: {
      label: 'Done',
      className: 'bg-success/10 text-success',
   },
   PARTIAL: {
      label: 'Done with gaps',
      className: 'bg-warning/10 text-warning',
   },
   FAILED: {
      label: 'Failed',
      className: 'bg-destructive/10 text-destructive',
   },
   STOPPED: {
      label: 'Stopped',
      className: 'bg-muted text-muted-foreground',
   },
}

// A step's state in words; a step whose requests wait for a retry says so.
export const stepLabel = (step: Pick<StepRun, 'status' | 'progress' | 'tries'>) => {
   const label =
      step.progress && step.progress.retrying > 0 && step.status !== 'DONE'
         ? 'Waiting to retry'
         : {
              WAITING: 'Waiting',
              RUNNING: 'Working',
              DONE: 'Done',
              PARTIAL: 'Done with gaps',
              FAILED: 'Failed',
              SKIPPED: 'Skipped',
           }[step.status]

   // A Retry ran the step again.
   return step.tries > 0 ? `${label} (try ${step.tries + 1})` : label
}

// When a step that is held back (a Wait, or the pause before a retry) goes on, as "8 Nov, 14:30"; null when it is not held
// back.
export const whenText = (waitUntil: string | null, now: Date = new Date()) => {
   const at = waitUntil ? new Date(waitUntil) : null

   if (!at || at <= now) {
      return null
   }

   const day = at.toLocaleDateString([], {
      day: 'numeric',
      month: 'short',
      year: at.getFullYear() === now.getFullYear() ? undefined : 'numeric',
   })
   const time = at.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
   })

   return `${day}, ${time}`
}

export const resumeText = (waitUntil: string | null, now: Date = new Date()) => {
   const when = whenText(waitUntil, now)

   return when ? `Resumes ${when}` : null
}

export const triggerLabels: Record<Run['trigger'], string> = {
   MANUAL: 'By hand',
   SCHEDULE: 'Schedule',
   PREVIEW: 'Preview',
   API: 'API call',
   WORKFLOW: 'After a workflow',
}
