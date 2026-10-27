import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search } from 'lucide-react'

import { FILTERS, type Filter } from './rows'

type Props = {
   query: string
   onQuery: (value: string) => void
   filter: Filter
   onFilter: (value: Filter) => void
   counts: Record<Filter, number>
}

// The four views of the list with how many each holds, and a search over what is in the list.
export const Toolbar = ({ query, onQuery, filter, onFilter, counts }: Props) => (
   <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs
         value={filter}
         onValueChange={value => {
            const picked = FILTERS.find(({ key }) => key === value)

            if (picked) {
               onFilter(picked.key)
            }
         }}
      >
         <TabsList className="h-auto flex-wrap">
            {FILTERS.map(({ key, label }) => (
               <TabsTrigger key={key} value={key} aria-label={`${label}, ${counts[key]}`} className="gap-2">
                  {label}
                  <span className="text-muted-foreground text-xs tabular-nums">{counts[key]}</span>
               </TabsTrigger>
            ))}
         </TabsList>
      </Tabs>
      <div className="relative w-full sm:w-72">
         <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" aria-hidden />
         <Input
            value={query}
            onChange={event => onQuery(event.target.value)}
            placeholder="Search name or headline"
            aria-label="Search requests"
            className="pl-8"
         />
      </div>
   </div>
)
