import { Handle, type NodeProps, Position } from '@xyflow/react'
import { CircleAlert, CircleCheck, CircleDashed, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

import { type FlowNode, summaryOf } from './graph-convert'
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

// One block on the canvas: its group, title and settings in a line, and during a run its state.
export const BlockNode = ({ data, selected }: NodeProps<FlowNode>) => {
   const { block, config, step, invalid, icpName } = data
   const Icon = step ? STEP_ICONS[step.status] : null

   return (
      <div
         className={cn(
            'bg-card w-56 rounded-lg border p-3 text-left shadow-sm',
            selected && 'ring-primary ring-2',
            invalid && 'border-destructive'
         )}
      >
         {block.input ? <Handle type="target" position={Position.Left} className="size-3!" /> : null}
         <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{block.group}</p>
         <p className="text-sm font-medium">{block.label}</p>
         <p className="text-muted-foreground mt-1 text-xs">{summaryOf(block, config, icpName)}</p>
         {step && Icon ? (
            <p className={cn('mt-2 flex items-center gap-1 text-xs', STEP_TONES[step.status])}>
               <Icon className={cn('size-3.5', step.status === 'RUNNING' && 'animate-spin')} />
               {step.itemsIn} in, {step.itemsOut} out
               {step.costMicros > 0 ? ` · ${formatUsd(step.costMicros)}` : ''}
            </p>
         ) : null}
         {block.output ? <Handle type="source" position={Position.Right} className="size-3!" /> : null}
      </div>
   )
}
