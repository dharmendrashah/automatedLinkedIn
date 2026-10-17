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
      label: 'Partly done',
      className: 'bg-warning/10 text-warning',
   },
   FAILED: {
      label: 'Failed',
      className: 'bg-destructive/10 text-destructive',
   },
}

export const triggerLabels: Record<Run['trigger'], string> = {
   MANUAL: 'By hand',
   SCHEDULE: 'Schedule',
   PREVIEW: 'Preview',
   API: 'API call',
   WORKFLOW: 'After a workflow',
}
