import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search } from 'lucide-react'
import { type ReactNode } from 'react'

import { ADDED_FILTERS, isAddedFilter } from '../labels/added'
import { LabelFilter } from '../labels/label-filter'
import { type LabelKind } from '../labels/labels'
import { type ListState } from './use-list-state'

type Props<S extends string> = {
   state: ListState<S>
   kind: LabelKind
   searchLabel: string
   searchPlaceholder: string
   // The page's own filters, after the shared ones.
   children?: ReactNode
}

// Search, when added and labels for a list of saved links.
export const ListToolbar = <S extends string>({ state, kind, searchLabel, searchPlaceholder, children }: Props<S>) => (
   <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
         <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
         <Input
            className="w-72 pl-8"
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            maxLength={100}
            value={state.search}
            onChange={event => state.setSearch(event.target.value)}
         />
      </div>
      <Select value={state.added} onValueChange={value => state.setAdded(isAddedFilter(value) ? value : 'any')}>
         <SelectTrigger className="w-52" aria-label="Filter by when it was added">
            <SelectValue />
         </SelectTrigger>
         <SelectContent>
            {Object.entries(ADDED_FILTERS).map(([value, label]) => (
               <SelectItem key={value} value={value}>
                  {label}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
      <LabelFilter
         id={`${kind}-label-filter`}
         kind={kind}
         tags={state.tags}
         match={state.tagMatch}
         onTags={state.setTags}
         onMatch={state.setTagMatch}
      />
      {children}
   </div>
)
