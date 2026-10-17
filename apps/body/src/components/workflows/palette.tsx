import { type DragEvent } from 'react'

import { type Block } from './types'

const GROUPS = ['Triggers', 'Inputs', 'Collect', 'Process', 'Output'] as const

export const DRAG_TYPE = 'application/x-workflow-block'

type Props = {
   catalog: Block[]
   onAdd: (block: Block) => void
}

// The blocks a workflow can use, by group. Drag one onto the canvas, or click it to add it.
export const Palette = ({ catalog, onAdd }: Props) => {
   const startDrag = (event: DragEvent, block: Block) => {
      event.dataTransfer.setData(DRAG_TYPE, block.type)
      event.dataTransfer.effectAllowed = 'move'
   }

   return (
      <div className="grid content-start gap-4 overflow-y-auto p-3">
         {GROUPS.map(group => (
            <div key={group} className="grid gap-1">
               <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{group}</p>
               {catalog
                  .filter(block => block.group === group)
                  .map(block => (
                     <button
                        key={block.type}
                        type="button"
                        draggable
                        title={block.summary}
                        onDragStart={event => startDrag(event, block)}
                        onClick={() => onAdd(block)}
                        className="hover:bg-muted rounded-md border px-2 py-1.5 text-left text-sm"
                     >
                        {block.label}
                     </button>
                  ))}
            </div>
         ))}
      </div>
   )
}
