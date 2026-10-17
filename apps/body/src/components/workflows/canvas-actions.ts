import { createContext } from 'react'

// What a block on the canvas can ask the editor to do.
export const CanvasActions = createContext<{ addAfter: (id: string) => void }>({ addAfter: () => undefined })
