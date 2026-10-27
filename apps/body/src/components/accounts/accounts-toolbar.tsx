import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
   DropdownMenu,
   DropdownMenuCheckboxItem,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronDown, Columns3 } from 'lucide-react'

import { COLUMNS, type ColumnId, toggleColumn } from './columns'
import { CHIPS, type Chip, MAIN_CHIPS } from './toolbar'

const ALL_CLIENTS = '__all'

type Props = {
   q: string
   onQ: (value: string) => void
   client: string
   onClient: (value: string) => void
   clients: string[]
   chip: Chip
   onChip: (value: Chip) => void
   counts: Record<Chip, number>
   grouped: boolean
   onGrouped: (value: boolean) => void
   columns: ColumnId[]
   onColumns: (value: ColumnId[]) => void
}

// Find an account and narrow the list: words, a client, one chip, grouping by client and which optional columns show. The four
// browsing counts and Paused sit under More; the chip in use is always shown.
export const AccountsToolbar = ({
   q,
   onQ,
   client,
   onClient,
   clients,
   chip,
   onChip,
   counts,
   grouped,
   onGrouped,
   columns,
   onColumns,
}: Props) => {
   const shown = MAIN_CHIPS.includes(chip) ? MAIN_CHIPS : [...MAIN_CHIPS, chip]
   const more = CHIPS.filter(item => !shown.includes(item.chip))

   return (
      <div className="grid gap-3">
         <div className="flex flex-wrap items-center gap-3">
            <Input
               type="search"
               aria-label="Search accounts"
               placeholder="Search by email or client"
               className="w-64"
               maxLength={100}
               value={q}
               onChange={event => onQ(event.target.value)}
            />
            {clients.length > 0 ? (
               <Select
                  value={client === '' ? ALL_CLIENTS : client}
                  onValueChange={value => onClient(value === ALL_CLIENTS ? '' : value)}
               >
                  <SelectTrigger className="w-48" aria-label="Client">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
                     {clients.map(item => (
                        <SelectItem key={item} value={item}>
                           {item}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
               <Checkbox checked={grouped} onCheckedChange={value => onGrouped(value === true)} />
               Group by client
            </label>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="ml-auto">
                     <Columns3 />
                     Columns
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {COLUMNS.map(({ id, label }) => (
                     <DropdownMenuCheckboxItem
                        key={id}
                        checked={columns.includes(id)}
                        onCheckedChange={() => onColumns(toggleColumn(columns, id))}
                        onSelect={event => event.preventDefault()}
                     >
                        {label}
                     </DropdownMenuCheckboxItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
         <div role="group" aria-label="Filter accounts" className="flex flex-wrap items-center gap-2">
            {CHIPS.filter(item => shown.includes(item.chip)).map(item => (
               <Tooltip key={item.chip}>
                  <TooltipTrigger asChild>
                     <Button
                        variant={chip === item.chip ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={chip === item.chip}
                        onClick={() => onChip(chip === item.chip ? 'all' : item.chip)}
                     >
                        {item.label}
                        <span className="tabular-nums">{counts[item.chip]}</span>
                     </Button>
                  </TooltipTrigger>
                  <TooltipContent>{item.rule}</TooltipContent>
               </Tooltip>
            ))}
            {more.length > 0 ? (
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="outline" size="sm">
                        More
                        <ChevronDown />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                     {more.map(item => (
                        <DropdownMenuItem key={item.chip} onSelect={() => onChip(item.chip)} title={item.rule}>
                           {item.label}
                           <span className="text-muted-foreground ml-auto tabular-nums">{counts[item.chip]}</span>
                        </DropdownMenuItem>
                     ))}
                  </DropdownMenuContent>
               </DropdownMenu>
            ) : null}
         </div>
      </div>
   )
}
