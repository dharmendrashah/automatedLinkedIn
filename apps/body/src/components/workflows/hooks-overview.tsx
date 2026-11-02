import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { type Edge } from '@xyflow/react'

import { type RunDetail } from './types'

import { type FlowNode, HOOK_PHASES, HOOK_WORDS, attachedTo } from './graph-convert'

type Props = {
   nodes: FlowNode[]
   edges: Edge[]
   // What the hooks did in the run on the canvas.
   fires: RunDetail['hooks'] | undefined
   show: boolean
   onShow: (show: boolean) => void
   onFocus: (id: string) => void
}

// Every hook of the workflow in one list, with its state in the last run, and the switch that hides the chains from the canvas.
export const HooksOverview = ({ nodes, edges, fires, show, onShow, onFocus }: Props) => {
   const rows = nodes.flatMap(node =>
      HOOK_PHASES.flatMap(phase => {
         const blocks = attachedTo(edges, node.id, phase)

         return blocks === 0
            ? []
            : [
                 {
                    id: node.id,
                    phase,
                    blocks,
                    name: node.data.label ?? node.data.block.label,
                    paused: node.data.hooks?.[phase]?.off === true,
                    fired: fires?.find(fire => fire.nodeId === node.id && fire.phase === phase),
                 },
              ]
      })
   )

   if (rows.length === 0) {
      return null
   }

   return (
      <details className="grid gap-1 text-xs">
         <summary className="cursor-pointer">Hooks ({rows.length})</summary>
         <div className="mt-2 flex items-center gap-2">
            <Checkbox id="show-hooks" checked={show} onCheckedChange={next => onShow(next === true)} />
            <Label htmlFor="show-hooks">Show hooks on the canvas</Label>
         </div>
         <ul className="mt-2 grid gap-1">
            {rows.map(row => (
               <li key={`${row.id}:${row.phase}`}>
                  <button type="button" className="text-left hover:underline" onClick={() => onFocus(row.id)}>
                     {HOOK_WORDS[row.phase]} {row.name}: {row.blocks} {row.blocks === 1 ? 'chain' : 'chains'}
                     {row.paused ? ', paused' : ''}
                     {row.fired
                        ? `, last run ${row.fired.fired} started${row.fired.failed > 0 ? `, ${row.fired.failed} failed` : ''}`
                        : ''}
                  </button>
               </li>
            ))}
         </ul>
      </details>
   )
}
