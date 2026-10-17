import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, X } from 'lucide-react'

import { type ListState } from './use-list-state'

type Props<S extends string> = {
   state: ListState<S>
   // The statuses to filter by, with the label shown for each.
   statuses: Record<S, { label: string }>
   searchLabel: string
   searchPlaceholder: string
}

export const ListToolbar = <S extends string>({ state, statuses, searchLabel, searchPlaceholder }: Props<S>) => {
   const isStatus = (value: string): value is S => value in statuses

   return (
      <div className="flex flex-wrap items-center gap-2">
         <div className="relative">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
               className="w-64 pl-8"
               placeholder={searchPlaceholder}
               aria-label={searchLabel}
               maxLength={100}
               value={state.search}
               onChange={event => state.setSearch(event.target.value)}
            />
         </div>
         <Select value={state.status} onValueChange={value => state.setStatus(isStatus(value) ? value : 'all')}>
            <SelectTrigger className="w-40" aria-label="Filter by status">
               <SelectValue />
            </SelectTrigger>
            <SelectContent>
               <SelectItem value="all">All statuses</SelectItem>
               {Object.entries<{ label: string }>(statuses).map(([value, { label }]) => (
                  <SelectItem key={value} value={value}>
                     {label}
                  </SelectItem>
               ))}
            </SelectContent>
         </Select>
         {state.tag ? (
            <Badge variant="secondary" className="gap-1">
               Tag: {state.tag}
               <button type="button" aria-label="Clear the tag filter" onClick={() => state.setTag(undefined)}>
                  <X className="size-3" />
               </button>
            </Badge>
         ) : null}
         <div className="flex items-center gap-2">
            <Checkbox
               id="show-archived"
               checked={state.includeArchived}
               onCheckedChange={checked => state.setIncludeArchived(checked === true)}
            />
            <Label htmlFor="show-archived">Show archived</Label>
         </div>
      </div>
   )
}
