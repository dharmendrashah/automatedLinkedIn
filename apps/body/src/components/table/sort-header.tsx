import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'

// A sortable column header: the arrow shows the order, faint while the column is not sorted.
export const SortHeader = ({
   label,
   sorted,
   onClick,
}: {
   label: string
   sorted: false | 'asc' | 'desc'
   onClick?: (event: unknown) => void
}) => {
   const Arrow = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown

   return (
      <button
         type="button"
         className="hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded px-1"
         aria-label={`Sort by ${label.toLowerCase()}`}
         onClick={onClick}
      >
         {label}
         <Arrow className={cn('size-3.5', !sorted && 'opacity-40')} />
      </button>
   )
}
