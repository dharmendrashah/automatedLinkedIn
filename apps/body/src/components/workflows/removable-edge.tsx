import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@xyflow/react'
import { X } from 'lucide-react'
import { useContext, useEffect, useRef, useState } from 'react'

import { CanvasActions } from './canvas-actions'

// The pointer may leave the line a moment before it reaches the button, which sits outside the drawing.
const HOVER_GRACE_MS = 150

// A line between two blocks; while it is hovered or selected it shows a button to remove it. A line that carries a run's
// count keeps the count in the middle instead.
export const RemovableEdge = ({
   id,
   sourceX,
   sourceY,
   targetX,
   targetY,
   sourcePosition,
   targetPosition,
   label,
   labelStyle,
   labelShowBg,
   labelBgStyle,
   labelBgPadding,
   labelBgBorderRadius,
   markerEnd,
   markerStart,
   style,
   interactionWidth,
   selected,
}: EdgeProps) => {
   const { removeEdge } = useContext(CanvasActions)
   const [hovered, setHovered] = useState(false)
   const timer = useRef<number | undefined>(undefined)
   const over = (on: boolean) => {
      window.clearTimeout(timer.current)

      if (on) {
         setHovered(true)
      } else {
         timer.current = window.setTimeout(() => setHovered(false), HOVER_GRACE_MS)
      }
   }

   useEffect(() => () => window.clearTimeout(timer.current), [])
   const [path, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
   })

   return (
      <>
         <g onMouseEnter={() => over(true)} onMouseLeave={() => over(false)}>
            <BaseEdge
               id={id}
               path={path}
               labelX={labelX}
               labelY={labelY}
               label={label}
               labelStyle={labelStyle}
               labelShowBg={labelShowBg}
               labelBgStyle={labelBgStyle}
               labelBgPadding={labelBgPadding}
               labelBgBorderRadius={labelBgBorderRadius}
               markerEnd={markerEnd}
               markerStart={markerStart}
               style={style}
               interactionWidth={interactionWidth}
            />
         </g>
         {(selected || hovered) && !label ? (
            <EdgeLabelRenderer>
               <button
                  type="button"
                  aria-label="Remove this line"
                  title="Remove this line"
                  onMouseEnter={() => over(true)}
                  onMouseLeave={() => over(false)}
                  onClick={event => {
                     event.stopPropagation()
                     removeEdge(id)
                  }}
                  style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
                  className="nodrag nopan bg-background hover:bg-destructive hover:text-destructive-foreground pointer-events-auto absolute grid size-6 place-items-center rounded-full border shadow-sm"
               >
                  <X className="size-3.5" />
               </button>
            </EdgeLabelRenderer>
         ) : null}
      </>
   )
}
