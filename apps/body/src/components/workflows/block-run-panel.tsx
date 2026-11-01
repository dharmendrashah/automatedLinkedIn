import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CircleAlert, Copy, Info } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'

import { type Block, type ConfigValue, type StepRun, formatUsd, resumeText } from './types'

import { trpc } from '../../trpc'
import { Code } from './api-request'
import { KIND_WORDS, sampleOf } from './api-sample'
import { type BlockRun, adviceOf } from './block-run'
import { isInputType } from './input-kinds'
import { InputMatches } from './input-matches'

// The state of a block in the last run, an error that explains itself, and what a block takes before it ran
// (.plan/workflow-hardening-and-block-details.md).

const STATE_TEXT = {
   never: 'Not run yet',
   waiting: 'Waiting',
   working: 'Working',
   done: 'Done',
   gaps: 'Done with gaps',
   failed: 'Failed',
   skipped: 'Skipped',
} as const

const STATE_TONE = {
   never: 'bg-muted text-muted-foreground',
   waiting: 'bg-muted text-muted-foreground',
   working: 'bg-warning/10 text-warning',
   done: 'bg-success/10 text-success',
   gaps: 'bg-warning/10 text-warning',
   failed: 'bg-destructive/10 text-destructive',
   skipped: 'bg-muted text-muted-foreground',
} as const

// One line about the block in the last run: its state, how much went in and out, what it cost.
export const RunStrip = ({ blockRun }: { blockRun: BlockRun }) => {
   const { state, step } = blockRun
   const held = state === 'waiting' && step ? resumeText(step.waitUntil) : null
   const notRun = state === 'never' && blockRun.addedAfter ? 'Added after the last run' : STATE_TEXT[state]
   const parts = [
      held ?? notRun,
      step && state === 'skipped' ? step.message : null,
      step && state !== 'never' && state !== 'waiting' && state !== 'skipped'
         ? `${step.itemsIn} in, ${step.itemsOut} out`
         : null,
      step && step.costMicros > 0 ? formatUsd(step.costMicros) : null,
      step && step.tries > 0 ? `try ${step.tries + 1}` : null,
   ].filter(Boolean)

   return (
      <div className="grid gap-1 text-sm">
         <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('border-transparent', STATE_TONE[state])}>
               {STATE_TEXT[state]}
            </Badge>
            <span className="text-muted-foreground">{parts.join(' · ')}</span>
         </div>
         {blockRun.changedAfter ? (
            <p className="text-warning flex items-center gap-1 text-xs">
               <Info className="size-3.5" aria-hidden />
               This block changed after the last run, so what you see below is from its older settings.
            </p>
         ) : null}
      </div>
   )
}

type ErrorProps = {
   step: StepRun
   // Opens the block's settings, for a fix that needs one.
   onShowSettings: () => void
}

// Why a step failed or ended with gaps, what can have caused it, and what to do (never raw error text).
export const StepErrorPanel = ({ step, onShowSettings }: ErrorProps) => {
   const catalog = trpc.workflow.stepErrors.useQuery(undefined, { staleTime: Number.POSITIVE_INFINITY })
   const advice = adviceOf(catalog.data ?? [], step.errorCode)
   const failed = step.status === 'FAILED'
   const reference = [step.errorCode ?? 'UNKNOWN', step.id.slice(0, 8), step.tries > 0 ? `try ${step.tries + 1}` : null]
      .filter(Boolean)
      .join(' · ')

   if (!advice) {
      return null
   }

   return (
      <div
         role="alert"
         className={cn(
            'grid gap-3 rounded-lg border p-3 text-sm',
            failed ? 'border-destructive/40 bg-destructive/5' : 'border-warning/40 bg-warning/5'
         )}
      >
         <div className="flex items-start gap-2">
            <CircleAlert className={cn('mt-0.5 size-4 shrink-0', failed ? 'text-destructive' : 'text-warning')} />
            <div className="grid gap-1">
               <p className="font-medium">{advice.title}</p>
               {step.message ? <p className="text-muted-foreground">{step.message}</p> : null}
            </div>
         </div>
         <div className="grid gap-1">
            <p className="text-xs font-medium">Why this can happen</p>
            <ul className="text-muted-foreground list-disc pl-5">
               {advice.why.map(reason => (
                  <li key={reason}>{reason}</li>
               ))}
            </ul>
         </div>
         <div className="grid gap-2">
            <p className="text-xs font-medium">What you can do</p>
            <ol className="grid list-decimal gap-2 pl-5">
               {advice.fixes.map(fix => (
                  <li key={fix.text}>
                     <span>{fix.text}</span>
                     {fix.action === 'settings' ? (
                        <Button variant="outline" size="sm" className="ml-2" onClick={onShowSettings}>
                           Open settings
                        </Button>
                     ) : null}
                     {fix.action === 'accounts' ? (
                        <Button variant="outline" size="sm" className="ml-2" asChild>
                           <Link to="/accounts">LinkedIn accounts</Link>
                        </Button>
                     ) : null}
                     {fix.action === 'icps' ? (
                        <Button variant="outline" size="sm" className="ml-2" asChild>
                           <Link to="/icps">Ideal customers</Link>
                        </Button>
                     ) : null}
                  </li>
               ))}
            </ol>
         </div>
         <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span>Reference: {reference}</span>
            <Button
               variant="ghost"
               size="sm"
               className="h-6 px-2"
               onClick={() => {
                  void navigator.clipboard.writeText(reference).then(() => toast('Reference copied'))
               }}
            >
               <Copy />
               Copy
            </Button>
         </div>
      </div>
   )
}

type PlannedProps = {
   block: Block
   workflowId: string
   values: Record<string, ConfigValue | undefined>
   // The blocks connected before this one.
   parents: { id: string; name: string }[]
   // What the estimate says the block takes, or null while it is not known.
   estimate: { items: number; costMicros: number } | null
   // The block's settings in one line.
   summary: string
   takes: string
   // A line leads straight from the "When called by API" block into this one.
   afterCall: boolean
}

// What a block takes in when it has not run: where it comes from, a sample, what it is set to, and about how much.
export const PlannedInput = ({
   block,
   workflowId,
   values,
   parents,
   estimate,
   summary,
   takes,
   afterCall,
}: PlannedProps) => {
   const fed = block.input !== null && block.input !== 'start'
   const sample = sampleOf(block)

   return (
      <div className="grid gap-3 text-sm">
         <p>{takes}</p>
         {fed ? (
            <p className="text-muted-foreground">
               {parents.length > 0
                  ? `Comes from: ${parents.map(({ name }) => name).join(', ')}.`
                  : 'Nothing is connected before this block, so it gets nothing. Connect a block into it.'}
            </p>
         ) : null}
         {afterCall && block.input !== null && block.input !== 'start' ? (
            <p className="text-warning flex items-start gap-1 text-xs">
               <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
               The API call passes nothing on by itself. To let a call send {KIND_WORDS[block.input]}, put an input
               block between the call and this block.
            </p>
         ) : null}
         {sample ? (
            <div className="grid gap-1">
               <p className="text-xs font-medium">A sample of one item it takes (made up)</p>
               <Code text={sample} label="Copy sample" />
            </div>
         ) : null}
         {block.api.length > 0 ? (
            <div className="grid gap-1">
               <p className="text-xs font-medium">A call can send</p>
               <ul className="text-muted-foreground list-disc pl-5 text-xs">
                  {block.api.map(({ field, what, example }) => (
                     <li key={field}>
                        <code>{field}</code>: {what}, such as {example[0]}
                     </li>
                  ))}
               </ul>
               {block.api.some(({ setting }) => setting) ? (
                  <p className="text-muted-foreground text-xs">
                     What a call sends replaces the saved setting for that run, so a call can change what it costs.
                  </p>
               ) : null}
            </div>
         ) : null}
         <p className="text-muted-foreground">Set to: {summary}</p>
         {estimate && estimate.items > 0 ? (
            <p className="text-muted-foreground">
               In a run it takes up to about {estimate.items.toLocaleString('en-US')} items
               {estimate.costMicros > 0 ? `, at most ${formatUsd(estimate.costMicros)}` : ''}.
            </p>
         ) : null}
         {isInputType(block.type) ? <InputMatches workflowId={workflowId} type={block.type} values={values} /> : null}
         <p className="text-muted-foreground text-xs">Run the workflow to see what really reaches this block.</p>
      </div>
   )
}
