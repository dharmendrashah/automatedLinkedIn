import { createContext } from 'react'

import { type Side } from './graph-convert'

// What a block or a line on the canvas can ask the editor to do: add a block on one of a block's sides, remove a block or a
// line.
export const CanvasActions = createContext<{
   addNextTo: (id: string, side: Side) => void
   removeNode: (id: string) => void
   removeEdge: (id: string) => void
   // Switches a block off (it passes everything on without running) or on again.
   toggleOff: (id: string) => void
}>({
   addNextTo: () => undefined,
   toggleOff: () => undefined,
   removeNode: () => undefined,
   removeEdge: () => undefined,
})
