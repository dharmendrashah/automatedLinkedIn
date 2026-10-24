import { Button } from '@/components/ui/button'
import { type ReactNode, useState } from 'react'

import { cn } from '@/lib/utils'

import { slice } from './lists'

type Props<T> = {
   items: readonly T[]
   // How many are shown before "Show all".
   shown: number
   // LinkedIn's total, when it is larger than what was kept.
   total?: number
   render: (item: T) => ReactNode
   className?: string
}

// The first few items, and the rest opened in place. A list that kept fewer than LinkedIn has says so.
export const ExpandableList = <T,>({ items, shown, total, render, className }: Props<T>) => {
   const [expanded, setExpanded] = useState(false)
   const { visible, hidden } = slice(items, shown, expanded)
   const missing = (total ?? 0) - items.length

   return (
      <>
         <ul className={cn('grid gap-4', className)}>
            {visible.map((item, index) => (
               <li key={index}>{render(item)}</li>
            ))}
         </ul>
         {items.length > shown ? (
            <Button
               variant="ghost"
               size="sm"
               className="w-fit"
               aria-expanded={expanded}
               onClick={() => setExpanded(current => !current)}
            >
               {expanded ? 'Show fewer' : `Show all ${items.length}`}
            </Button>
         ) : null}
         {missing > 0 && (hidden === 0 || expanded) ? (
            <p className="text-muted-foreground text-xs">
               Showing {items.length} of {total}. The rest is on LinkedIn.
            </p>
         ) : null}
      </>
   )
}
