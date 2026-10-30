import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

import { type PeopleFilters, chipsOf } from './model'

type Props = {
   value: PeopleFilters
   accountName?: (id: string) => string
   onChange: (value: PeopleFilters) => void
   onClearAll: () => void
}

// The filters that are on, each removable, so the owner always sees why the list is short.
export const FilterChips = ({ value, accountName, onChange, onClearAll }: Props) => {
   const chips = chipsOf(value, accountName)

   if (chips.length === 0) {
      return null
   }

   return (
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Filters on">
         {chips.map(chip => (
            <span
               key={chip.key}
               className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-xs font-medium"
            >
               {chip.text}
               <button
                  type="button"
                  className="hover:bg-primary/15 rounded-full p-0.5"
                  aria-label={`Remove ${chip.text}`}
                  onClick={() => onChange({ ...value, ...chip.clear })}
               >
                  <X className="size-3" />
               </button>
            </span>
         ))}
         <Button variant="link" size="sm" className="h-7 px-2 text-xs" onClick={onClearAll}>
            Clear all
         </Button>
      </div>
   )
}
