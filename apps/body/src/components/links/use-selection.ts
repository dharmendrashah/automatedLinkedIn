import { useState } from 'react'

// The rows picked for a bulk action.
export const useSelection = () => {
   const [selected, setSelected] = useState<Set<string>>(new Set())

   return {
      selected,
      select: (ids: string[], on: boolean) =>
         setSelected(previous => {
            const next = new Set(previous)

            ids.forEach(id => (on ? next.add(id) : next.delete(id)))

            return next
         }),
      clear: () => setSelected(new Set()),
   }
}

export type Selection = ReturnType<typeof useSelection>
