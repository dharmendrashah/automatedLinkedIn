import { Button } from '@/components/ui/button'
import { useState } from 'react'

import { cn } from '@/lib/utils'

const LONG_TEXT = 240
const LONG_LINES = 3

type Props = {
   text: string
   // The number of lines it is cut to until opened.
   lines?: 2 | 3 | 4 | 6
   className?: string
}

const CLAMP = {
   2: 'line-clamp-2',
   3: 'line-clamp-3',
   4: 'line-clamp-4',
   6: 'line-clamp-6',
} as const

// A text of someone's, shown as text (never as markup), cut to a few lines with "more" when it is long.
export const ExpandableText = ({ text, lines = 3, className }: Props) => {
   const [open, setOpen] = useState(false)
   const long = text.length > LONG_TEXT || text.split('\n').length > LONG_LINES

   return (
      <div className={className}>
         <p dir="auto" className={cn('text-sm break-words whitespace-pre-line', !open && long && CLAMP[lines])}>
            {text}
         </p>
         {long ? (
            <Button
               variant="link"
               size="sm"
               className="h-auto p-0 text-xs"
               aria-expanded={open}
               onClick={() => setOpen(current => !current)}
            >
               {open ? 'less' : 'more'}
            </Button>
         ) : null}
      </div>
   )
}
