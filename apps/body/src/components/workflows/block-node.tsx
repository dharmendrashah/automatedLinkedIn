import { Handle, type NodeProps, Position } from '@xyflow/react'
import { CircleAlert, CircleCheck, CircleDashed, CircleSlash, Info, Loader2, Plus, Trash2 } from 'lucide-react'
import { useContext } from 'react'

import { cn } from '@/lib/utils'

import { formatUsd } from './types'

import { trpc } from '../../trpc'
import { BLOCK_ICONS, tileOf } from './block-look'
import { adviceOf } from './block-run'
import { CanvasActions } from './canvas-actions'
import { type FlowNode, SIDES, summaryOf } from './graph-convert'
import { NODE_WIDTH } from './layout'
import { timeOf } from './run-sentence'

const STEP_ICONS = {
   WAITING: CircleDashed,
   RUNNING: Loader2,
   DONE: CircleCheck,
   PARTIAL: CircleAlert,
   FAILED: CircleAlert,
   SKIPPED: CircleSlash,
} as const

const STEP_TONES = {
   WAITING: 'text-muted-foreground',
   RUNNING: 'text-warning',
   DONE: 'text-success',
   PARTIAL: 'text-warning',
   FAILED: 'text-destructive',
   SKIPPED: 'text-muted-foreground',
} as const

const POSITIONS = {
   top: Position.Top,
   right: Position.Right,
   bottom: Position.Bottom,
   left: Position.Left,
} as const

// Where each "+" sits: centred on its side, clear of the line handle.
const PLUS_PLACES = {
   top: '-top-9 left-1/2 -translate-x-1/2',
   right: '-right-9 top-1/2 -translate-y-1/2',
   bottom: '-bottom-9 left-1/2 -translate-x-1/2',
   left: '-left-9 top-1/2 -translate-y-1/2',
} as const

// Why a block failed or ended with gaps, in a few words; the block's dialog has the whole explanation.
const Reason = ({ code, failed }: { code: string | null; failed: boolean }) => {
   const catalog = trpc.workflow.stepErrors.useQuery(undefined, { staleTime: Number.POSITIVE_INFINITY })

   return (
      <p className={cn('mt-0.5 line-clamp-2 text-xs', failed ? 'text-destructive' : 'text-warning')}>
         {adviceOf(catalog.data ?? [], code)?.title ?? (failed ? 'Failed' : 'Done with gaps')}
      </p>
   )
}

// One block: icon, title and settings in a line, during a run its state, and a "+" on each side to add a block there. Lines
// leave and enter on any side.
export const BlockNode = ({ id, data, selected }: NodeProps<FlowNode>) => {
   const { block, config, step, invalid, noted, faded, icpName } = data
   const { addNextTo, removeNode } = useContext(CanvasActions)
   const Icon = BLOCK_ICONS[block.type]
   const StepIcon = step ? STEP_ICONS[step.status] : null
   const progress = step?.progress

   return (
      <div className={cn('group relative', faded && 'opacity-40')} style={{ width: NODE_WIDTH }}>
         <div
            className={cn(
               'bg-card flex items-start gap-3 rounded-xl border p-3 text-left shadow-sm transition-shadow hover:shadow-md',
               selected && 'ring-primary ring-2',
               noted && 'border-warning',
               invalid && 'border-destructive'
            )}
         >
            {SIDES.map(side => (
               <Handle
                  key={side}
                  id={side}
                  type="source"
                  position={POSITIONS[side]}
                  className="size-3! opacity-0 transition-opacity group-hover:opacity-100"
               />
            ))}
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tileOf(block.group))}>
               <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
               <p className="truncate text-sm font-medium">{block.label}</p>
               <p className="text-muted-foreground line-clamp-2 text-xs">{summaryOf(block, config, icpName)}</p>
               {step && StepIcon ? (
                  <p className={cn('mt-1 flex items-center gap-1 text-xs', STEP_TONES[step.status])}>
                     <StepIcon className={cn('size-3.5', step.status === 'RUNNING' && 'animate-spin')} />
                     {step.status === 'RUNNING' ? 'Working · ' : ''}
                     {step.itemsIn} in, {step.itemsOut} out
                     {step.costMicros > 0 ? ` · ${formatUsd(step.costMicros)}` : ''}
                  </p>
               ) : null}
               {step && (step.status === 'FAILED' || (step.status === 'PARTIAL' && step.errorCode)) ? (
                  <Reason code={step.errorCode} failed={step.status === 'FAILED'} />
               ) : null}
               {progress && progress.requests > progress.done ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                     {progress.done} of {progress.requests} done
                     {progress.retrying > 0 && progress.nextRetryAt
                        ? ` · retrying ${progress.retrying} at ${timeOf(progress.nextRetryAt)}`
                        : ''}
                  </p>
               ) : null}
               {faded ? <p className="text-muted-foreground mt-1 text-xs">Not in this run</p> : null}
               {invalid ? (
                  <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                     <CircleAlert className="size-3.5" aria-hidden />
                     Needs a setting
                  </p>
               ) : noted ? (
                  <p className="text-warning mt-1 flex items-center gap-1 text-xs">
                     <Info className="size-3.5" aria-hidden />
                     See the note
                  </p>
               ) : null}
            </div>
         </div>
         {step ? null : (
            <button
               type="button"
               aria-label={`Remove ${block.label} and its lines`}
               title="Remove this block"
               onClick={event => {
                  event.stopPropagation()
                  removeNode(id)
               }}
               className={cn(
                  'nodrag bg-background hover:bg-destructive hover:text-destructive-foreground absolute -top-2.5 -right-2.5 grid size-6 place-items-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                  selected && 'opacity-100'
               )}
            >
               <Trash2 className="size-3.5" />
            </button>
         )}
         {SIDES.filter(side => side !== 'top' || block.input !== null).map(side => (
            <button
               key={side}
               type="button"
               aria-label={`Add a block ${side === 'top' ? 'before' : 'after'} ${block.label}, on its ${side}`}
               onClick={event => {
                  event.stopPropagation()
                  addNextTo(id, side)
               }}
               className={cn(
                  'nodrag bg-background hover:bg-primary hover:text-primary-foreground absolute grid size-6 place-items-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                  PLUS_PLACES[side],
                  selected && 'opacity-100'
               )}
            >
               <Plus className="size-3.5" />
            </button>
         ))}
      </div>
   )
}
