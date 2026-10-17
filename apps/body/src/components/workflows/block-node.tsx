import { Handle, type NodeProps, Position } from '@xyflow/react'
import { CircleAlert, CircleCheck, CircleDashed, Loader2, Plus } from 'lucide-react'
import { useContext } from 'react'

import { cn } from '@/lib/utils'

import { BLOCK_ICONS, tileOf } from './block-look'
import { CanvasActions } from './canvas-actions'
import { type FlowNode, summaryOf } from './graph-convert'
import { NODE_WIDTH } from './layout'
import { formatUsd } from './types'

const STEP_ICONS = {
   WAITING: CircleDashed,
   RUNNING: Loader2,
   DONE: CircleCheck,
   PARTIAL: CircleAlert,
   FAILED: CircleAlert,
} as const

const STEP_TONES = {
   WAITING: 'text-muted-foreground',
   RUNNING: 'text-warning',
   DONE: 'text-success',
   PARTIAL: 'text-warning',
   FAILED: 'text-destructive',
} as const

// One block: icon, title and settings in a line, during a run its state, and a "+" to add the next block.
export const BlockNode = ({ id, data, selected }: NodeProps<FlowNode>) => {
   const { block, config, step, invalid, icpName } = data
   const { addAfter } = useContext(CanvasActions)
   const Icon = BLOCK_ICONS[block.type]
   const StepIcon = step ? STEP_ICONS[step.status] : null

   return (
      <div className="group relative" style={{ width: NODE_WIDTH }}>
         <div
            className={cn(
               'bg-card flex items-start gap-3 rounded-xl border p-3 text-left shadow-sm transition-shadow hover:shadow-md',
               selected && 'ring-primary ring-2',
               invalid && 'border-destructive'
            )}
         >
            {block.input ? <Handle type="target" position={Position.Top} className="size-3!" /> : null}
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tileOf(block.group))}>
               <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
               <p className="truncate text-sm font-medium">{block.label}</p>
               <p className="text-muted-foreground line-clamp-2 text-xs">{summaryOf(block, config, icpName)}</p>
               {step && StepIcon ? (
                  <p className={cn('mt-1 flex items-center gap-1 text-xs', STEP_TONES[step.status])}>
                     <StepIcon className={cn('size-3.5', step.status === 'RUNNING' && 'animate-spin')} />
                     {step.itemsIn} in, {step.itemsOut} out
                     {step.costMicros > 0 ? ` · ${formatUsd(step.costMicros)}` : ''}
                  </p>
               ) : null}
               {invalid ? (
                  <p className="text-destructive mt-1 flex items-center gap-1 text-xs">
                     <CircleAlert className="size-3.5" aria-hidden />
                     Needs attention
                  </p>
               ) : null}
            </div>
            {block.output ? <Handle type="source" position={Position.Bottom} className="size-3!" /> : null}
         </div>
         {block.output ? (
            <button
               type="button"
               aria-label={`Add a block after ${block.label}`}
               onClick={event => {
                  event.stopPropagation()
                  addAfter(id)
               }}
               className={cn(
                  'nodrag bg-background hover:bg-primary hover:text-primary-foreground absolute -bottom-9 left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                  selected && 'opacity-100'
               )}
            >
               <Plus className="size-3.5" />
            </button>
         ) : null}
      </div>
   )
}
